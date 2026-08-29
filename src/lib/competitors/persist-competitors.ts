import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  buildSubmittedSiteBaseline,
  compareCompetitorToSubmittedSite,
  competitorStrengths,
} from "@/lib/competitors/comparison";
import {
  discoverCompetitors,
  selectCompetitorsForAnalysis,
} from "@/lib/competitors/discovery";
import {
  analyzeCompetitorPages,
  type CompetitorPageDependencies,
} from "@/lib/competitors/page-analysis";
import type { OrganicSerpEvidence } from "@/lib/competitors/types";

function normalizeWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((warning): warning is string => typeof warning === "string")
    : [];
}

function mergeWarnings(...groups: string[][]) {
  return [...new Set(groups.flat().map((warning) => warning.slice(0, 500)))];
}

export interface CompetitorPersistenceDependencies
  extends CompetitorPageDependencies {
  concurrency?: number;
}

export async function discoverAndPersistCompetitors(
  submissionId: string,
  dependencies: CompetitorPersistenceDependencies = {},
) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      industry: true,
      location: true,
      normalizedDomain: true,
      primaryService: true,
      warnings: true,
      serpResults: {
        where: { resultType: "organic" },
        select: {
          domain: true,
          keyword: true,
          position: true,
          snippet: true,
          title: true,
          url: true,
        },
      },
      siteScan: {
        select: {
          pages: {
            select: {
              h1: true,
              h2s: true,
              mainText: true,
              structuredData: true,
              wordCount: true,
            },
          },
        },
      },
    },
  });
  if (!submission) throw new Error("Submission not found for competitor discovery.");

  const organicResults: OrganicSerpEvidence[] = submission.serpResults.flatMap(
    (result) =>
      result.domain && result.position && result.url
        ? [
            {
              domain: result.domain,
              keyword: result.keyword,
              position: result.position,
              snippet: result.snippet,
              title: result.title,
              url: result.url,
            },
          ]
        : [],
  );
  const discovered = discoverCompetitors({
    industry: submission.industry,
    primaryService: submission.primaryService,
    results: organicResults,
    submittedDomain: submission.normalizedDomain,
  });
  const selected = selectCompetitorsForAnalysis(discovered, 5);
  const analyzed = await analyzeCompetitorPages(
    selected,
    {
      location: submission.location,
      primaryService: submission.primaryService,
    },
    dependencies,
    dependencies.concurrency,
  );
  const analyzedByDomain = new Map(
    analyzed.map((result) => [result.candidate.domain, result]),
  );
  const baseline = buildSubmittedSiteBaseline({
    location: submission.location,
    pages: submission.siteScan?.pages ?? [],
    primaryService: submission.primaryService,
  });
  const stageWarnings = analyzed.flatMap((result) =>
    result.warning ? [result.warning] : [],
  );
  if (organicResults.length === 0) {
    stageWarnings.push("Competitor discovery unavailable: no organic SERP results were stored.");
  } else if (selected.length === 0) {
    stageWarnings.push("No direct competitors could be identified from the available SERP evidence.");
  }
  const warnings = mergeWarnings(
    normalizeWarnings(submission.warnings),
    stageWarnings,
  );

  const rows: Prisma.CompetitorCreateManyInput[] = discovered
    .slice(0, 20)
    .map((candidate) => {
      const analysis = analyzedByDomain.get(candidate.domain);
      const page = analysis?.page ?? null;
      const strengths = competitorStrengths(page);
      const gaps = compareCompetitorToSubmittedSite(page, baseline);
      return {
        submissionId,
        domain: candidate.domain,
        type: candidate.type,
        occurrenceCount: candidate.occurrenceCount,
        rankingUrls: candidate.rankingUrls,
        positioning: page
          ? [page.title, page.h1].filter(Boolean).join(" — ").slice(0, 500) || null
          : null,
        strengths: strengths as Prisma.InputJsonValue,
        gap: gaps as Prisma.InputJsonValue,
        evidence: {
          discovery: {
            bestPosition: candidate.bestPosition,
            matchedTerms: candidate.matchedTerms,
            queries: candidate.queries,
            relevanceScore: candidate.relevanceScore,
            selectionScore: candidate.selectionScore,
          },
          selectedForAnalysis: Boolean(analysis),
          page,
          warning: analysis?.warning ?? null,
        } as unknown as Prisma.InputJsonValue,
      };
    });
  const directDomainsByQuery = new Map<string, number>();
  for (const competitor of discovered.filter((item) => item.type === "direct")) {
    for (const keyword of competitor.queries) {
      directDomainsByQuery.set(keyword, (directDomainsByQuery.get(keyword) ?? 0) + 1);
    }
  }
  const competitorWrites = rows.length
    ? [db.competitor.createMany({ data: rows })]
    : [];
  const keywordWrites = [...directDomainsByQuery.entries()].map(
    ([keyword, competitorFrequency]) =>
      db.keyword.updateMany({
        where: { submissionId, keyword },
        data: { competitorFrequency },
      }),
  );
  await db.$transaction([
    db.competitor.deleteMany({ where: { submissionId } }),
    ...competitorWrites,
    ...keywordWrites,
    db.submission.update({
      where: { id: submissionId },
      data: { warnings: warnings as Prisma.InputJsonValue },
    }),
  ]);

  return {
    analyzedCount: analyzed.filter((result) => result.page !== null).length,
    discoveredCount: discovered.length,
    directCount: discovered.filter((result) => result.type === "direct").length,
    persistedCount: rows.length,
    selectedCount: selected.length,
    warnings,
  };
}

export async function persistCompetitorDiscoveryFailure(
  submissionId: string,
  error: unknown,
) {
  void error;
  const warning =
    "Competitor analysis unavailable: the competitor research stage could not be completed.";
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: { warnings: true },
  });
  if (!submission) return warning;
  const warnings = mergeWarnings(normalizeWarnings(submission.warnings), [warning]);
  await db.submission.update({
    where: { id: submissionId },
    data: { warnings: warnings as Prisma.InputJsonValue },
  });
  return warning;
}
