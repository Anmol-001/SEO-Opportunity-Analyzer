import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { scoreSeoOpportunity } from "@/lib/scoring/opportunity-engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function scoreAndPersistSubmission(submissionId: string) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      industry: true,
      location: true,
      primaryService: true,
      siteScan: {
        select: {
          pages: {
            select: {
              h1: true,
              h2s: true,
              mainText: true,
              metaDescription: true,
              pageType: true,
              structuredData: true,
              title: true,
              wordCount: true,
            },
          },
        },
      },
      keywords: {
        orderBy: { keyword: "asc" },
        select: {
          cluster: true,
          competitorFrequency: true,
          evidence: true,
          intent: true,
          keyword: true,
          paidCompetitionSignal: true,
          rankingPosition: true,
          rankingUrl: true,
          searchVolume: true,
        },
      },
      competitors: {
        select: {
          evidence: true,
          gap: true,
          type: true,
        },
      },
    },
  });
  if (!submission) throw new Error("Submission not found for opportunity scoring.");

  const result = scoreSeoOpportunity({
    competitors: submission.competitors,
    industry: submission.industry,
    keywords: submission.keywords,
    location: submission.location,
    pages: submission.siteScan?.pages ?? [],
    primaryService: submission.primaryService,
  });
  const keywordByName = new Map(
    submission.keywords.map((keyword) => [keyword.keyword, keyword]),
  );
  const keywordWrites = result.keywords.map((keyword) => {
    const original = keywordByName.get(keyword.keyword);
    const originalEvidence = isRecord(original?.evidence) ? original.evidence : {};
    return db.keyword.update({
      where: {
        submissionId_keyword: {
          submissionId,
          keyword: keyword.keyword,
        },
      },
      data: {
        contentCoverage: keyword.contentCoverage,
        keywordPriority: keyword.priorityScore,
        opportunityType: keyword.opportunityType,
        websiteRelevance: keyword.websiteRelevance,
        evidence: {
          ...originalEvidence,
          scoring: {
            findingId: keyword.findingId,
            formulaVersion: result.formulaVersion,
            priority: keyword.priority,
            rationale: keyword.rationale,
            signals: keyword.signals,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  });
  await db.$transaction([
    ...keywordWrites,
    db.submission.update({
      where: { id: submissionId },
      data: { opportunityScore: result.overallScore },
    }),
  ]);
  return result;
}
