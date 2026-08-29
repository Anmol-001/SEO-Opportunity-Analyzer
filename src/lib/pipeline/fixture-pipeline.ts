import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { demoReport } from "@/lib/reports/fixture";
import {
  persistScanFailure,
  scanAndPersistSubmission,
} from "@/lib/scanner/persist-scan";
import {
  persistSerpResearchFailure,
  researchAndPersistSubmission,
} from "@/lib/research/persist-serp-research";

const fixtureStages = [
  ["competitors", "Comparing recurring competitors"],
  ["keywords", "Scoring keyword opportunities"],
  ["generating", "Generating evidence-linked recommendations"],
] as const;

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

    for (const [status, progressMessage] of fixtureStages) {
      await db.submission.update({
        where: { id: submissionId },
        data: {
          status,
          progressMessage,
        },
      });
      await delay(350);
    }

    await db.$transaction([
      db.report.create({
        data: {
          submissionId,
          opportunityScore: 72,
          executiveSummary: demoReport.executiveSummary.overallAssessment,
          payload: demoReport as unknown as Prisma.InputJsonValue,
        },
      }),
      db.submission.update({
        where: { id: submissionId },
        data: {
          status: "complete",
          progressMessage: "Report ready",
          opportunityScore: 72,
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
