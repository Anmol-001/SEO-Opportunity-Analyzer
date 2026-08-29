import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  persistScanFailure,
  scanAndPersistSubmission,
} from "@/lib/scanner/persist-scan";
import {
  persistSerpResearchFailure,
  researchAndPersistSubmission,
} from "@/lib/research/persist-serp-research";
import {
  discoverAndPersistCompetitors,
  persistCompetitorDiscoveryFailure,
} from "@/lib/competitors/persist-competitors";
import { scoreAndPersistSubmission } from "@/lib/scoring/persist-scoring";
import { buildScoredFixtureReport } from "@/lib/scoring/scored-fixture-report";

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runFixturePipeline(submissionId: string) {
  const db = getDb();

  try {
    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "scanning",
        progressMessage: "Analyzing a focused website sample",
        processingStartedAt: new Date(),
      },
    });

    try {
      const scan = await scanAndPersistSubmission(submissionId);
      await db.submission.update({
        where: { id: submissionId },
        data: {
          progressMessage: `Website analyzed: ${scan.pages.length} page${scan.pages.length === 1 ? "" : "s"}`,
        },
      });
    } catch (error) {
      await persistScanFailure(submissionId, error);
    }

    await delay(350);

    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "researching",
        progressMessage: "Collecting live search results with Serper",
      },
    });

    let successfulQueries = 0;
    let queryCount = 0;
    try {
      const research = await researchAndPersistSubmission(submissionId);
      successfulQueries = research.successfulQueries;
      queryCount = research.queryCount;
    } catch (error) {
      await persistSerpResearchFailure(submissionId, error);
    }

    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "ranking",
        progressMessage:
          successfulQueries > 0
            ? `Visibility checked across ${successfulQueries} of ${queryCount} queries`
            : "Search data unavailable; continuing with available evidence",
      },
    });
    await delay(350);

    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "competitors",
        progressMessage: "Identifying and comparing recurring competitors",
      },
    });
    try {
      const competitors = await discoverAndPersistCompetitors(submissionId);
      await db.submission.update({
        where: { id: submissionId },
        data: {
          progressMessage: `Analyzed ${competitors.analyzedCount} of ${competitors.selectedCount} selected competitors`,
        },
      });
    } catch (error) {
      await persistCompetitorDiscoveryFailure(submissionId, error);
    }
    await delay(350);

    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "keywords",
        progressMessage: "Calculating deterministic keyword opportunities",
      },
    });
    const scoring = await scoreAndPersistSubmission(submissionId);
    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "generating",
        progressMessage: `Opportunity score calculated: ${scoring.overallScore}/100`,
      },
    });
    await delay(350);

    const reportPayload = buildScoredFixtureReport(scoring);

    await db.$transaction([
      db.report.upsert({
        where: { submissionId },
        create: {
          submissionId,
          opportunityScore: scoring.overallScore,
          executiveSummary: reportPayload.executiveSummary.overallAssessment,
          payload: reportPayload as unknown as Prisma.InputJsonValue,
        },
        update: {
          opportunityScore: scoring.overallScore,
          executiveSummary: reportPayload.executiveSummary.overallAssessment,
          payload: reportPayload as unknown as Prisma.InputJsonValue,
        },
      }),
      db.submission.update({
        where: { id: submissionId },
        data: {
          status: "complete",
          progressMessage: "Report ready",
          opportunityScore: scoring.overallScore,
          completedAt: new Date(),
        },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    await db.submission
      .update({
        where: { id: submissionId },
        data: {
          status: "failed",
          progressMessage: "Assessment could not be completed",
          failureReason: message.slice(0, 500),
        },
      })
      .catch(() => undefined);
  }
}
