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
  collectAndPersistKeywordMetrics,
  persistKeywordMetricsFailure,
} from "@/lib/research/persist-keyword-metrics";
import {
  discoverAndPersistCompetitors,
  persistCompetitorDiscoveryFailure,
} from "@/lib/competitors/persist-competitors";
import { scoreAndPersistSubmission } from "@/lib/scoring/persist-scoring";
import { synthesizeSubmissionReport } from "@/lib/ai/synthesize-report";
import { deliverCompletionWebhook } from "@/lib/webhooks/persist-webhook";

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runAnalysisPipeline(submissionId: string) {
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
        progressMessage: "Collecting Google Ads keyword demand signals",
      },
    });
    try {
      const metrics = await collectAndPersistKeywordMetrics(submissionId);
      await db.submission.update({
        where: { id: submissionId },
        data: {
          progressMessage:
            metrics.availableCount > 0
              ? `Search-volume metrics collected for ${metrics.availableCount} of ${metrics.keywordCount} keywords`
              : "Keyword metrics unavailable; scoring available evidence",
        },
      });
    } catch (error) {
      await persistKeywordMetricsFailure(submissionId, error);
    }
    await delay(350);

    await db.submission.update({
      where: { id: submissionId },
      data: {
        progressMessage: "Calculating deterministic keyword opportunities",
      },
    });
    const scoring = await scoreAndPersistSubmission(submissionId);
    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "generating",
        progressMessage: `Score ${scoring.overallScore}/100 calculated; synthesizing evidence-linked recommendations`,
      },
    });
    await delay(350);

    const synthesis = await synthesizeSubmissionReport(submissionId, scoring);
    const reportPayload = synthesis.report;

    await db.$transaction([
      db.report.upsert({
        where: { submissionId },
        create: {
          submissionId,
          schemaVersion: "1.2",
          opportunityScore: scoring.overallScore,
          executiveSummary: reportPayload.executiveSummary.overallAssessment,
          payload: reportPayload as unknown as Prisma.InputJsonValue,
        },
        update: {
          schemaVersion: "1.2",
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
    await deliverCompletionWebhook(submissionId).catch(() => undefined);
  } catch (error) {
    console.error("Assessment pipeline failed.", { submissionId, error });
    await db.submission
      .update({
        where: { id: submissionId },
        data: {
          status: "failed",
          progressMessage: "Assessment could not be completed",
          failureReason:
            "The analysis could not be completed with enough reliable evidence. Please try again.",
        },
      })
      .catch(() => undefined);
  }
}
