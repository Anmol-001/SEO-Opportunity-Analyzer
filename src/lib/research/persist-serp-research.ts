import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  createSerperProviderFromEnv,
} from "@/lib/providers/serper";
import type { SeoProvider } from "@/lib/providers/seo-provider";
import { discoverQueries } from "@/lib/research/query-discovery";
import {
  domainMatchesSubmission,
  findSubmittedDomainRanking,
  researchSearchLandscape,
} from "@/lib/research/serp-research";

function normalizeWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((warning): warning is string => typeof warning === "string")
    : [];
}

function mergeWarnings(...groups: string[][]) {
  return [...new Set(groups.flat().map((warning) => warning.slice(0, 500)))];
}

export interface SerpResearchDependencies {
  provider?: SeoProvider;
  concurrency?: number;
}

export async function researchAndPersistSubmission(
  submissionId: string,
  dependencies: SerpResearchDependencies = {},
) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      industry: true,
      location: true,
      mainGoal: true,
      normalizedDomain: true,
      primaryService: true,
      targetKeywords: true,
      warnings: true,
    },
  });
  if (!submission) throw new Error("Submission not found for SERP research.");

  const queries = discoverQueries({
    industry: submission.industry,
    location: submission.location,
    mainGoal: submission.mainGoal,
    primaryService: submission.primaryService,
    targetKeywords: submission.targetKeywords,
  });
  const provider = dependencies.provider ?? createSerperProviderFromEnv();
  const landscape = await researchSearchLandscape(
    { location: submission.location, queries },
    provider,
    dependencies.concurrency,
  );
  const warnings = mergeWarnings(
    normalizeWarnings(submission.warnings),
    landscape.warnings,
  );
  const keywordRows: Prisma.KeywordCreateManyInput[] = [];
  const serpRows: Prisma.SerpResultCreateManyInput[] = [];

  for (const researched of landscape.queries) {
    const ranking = researched.snapshot
      ? findSubmittedDomainRanking(researched.snapshot, submission.normalizedDomain)
      : { rankingPosition: null, rankingUrl: null };
    const evidence = researched.snapshot
      ? {
          provider: provider.name,
          status: "available",
          searchLocation: landscape.location,
          organicResultCount: researched.snapshot.organicResults.length,
          serpFeatures: researched.snapshot.features,
          relatedSearches: researched.snapshot.relatedSearches,
        }
      : {
          provider: provider.name,
          status: "unavailable",
          searchLocation: landscape.location,
          warning: researched.warning,
        };
    keywordRows.push({
      submissionId,
      keyword: researched.query.keyword,
      cluster: researched.query.cluster,
      intent: researched.query.intent,
      rankingPosition: ranking.rankingPosition,
      rankingUrl: ranking.rankingUrl,
      evidence: evidence as unknown as Prisma.InputJsonValue,
    });

    if (!researched.snapshot) continue;
    serpRows.push({
      submissionId,
      keyword: researched.query.keyword,
      searchLocation: landscape.location.name,
      resultType: "serp_summary",
      serpFeatures: {
        features: researched.snapshot.features,
        relatedSearches: researched.snapshot.relatedSearches,
        countryCode: landscape.location.countryCode,
      },
      rawProviderRef: researched.snapshot.providerReference,
    });
    for (const result of researched.snapshot.organicResults) {
      serpRows.push({
        submissionId,
        keyword: researched.query.keyword,
        searchLocation: landscape.location.name,
        position: result.position,
        url: result.url,
        domain: result.domain,
        title: result.title,
        snippet: result.snippet,
        resultType: "organic",
        submittedSiteHit: domainMatchesSubmission(
          result.domain,
          submission.normalizedDomain,
        ),
        rawProviderRef: researched.snapshot.providerReference,
      });
    }
  }

  await db.$transaction([
    db.serpResult.deleteMany({ where: { submissionId } }),
    db.keyword.deleteMany({ where: { submissionId } }),
    db.keyword.createMany({ data: keywordRows }),
    db.serpResult.createMany({ data: serpRows }),
    db.submission.update({
      where: { id: submissionId },
      data: { warnings: warnings as Prisma.InputJsonValue },
    }),
  ]);

  const successfulQueries = landscape.queries.filter(
    (query) => query.snapshot !== null,
  ).length;
  return {
    provider: provider.name,
    location: landscape.location,
    queryCount: landscape.queries.length,
    successfulQueries,
    failedQueries: landscape.queries.length - successfulQueries,
    warnings,
  };
}

export async function persistSerpResearchFailure(
  submissionId: string,
  error: unknown,
) {
  const message =
    error instanceof Error && error.name === "SerperProviderError"
      ? error.message
      : "The search research stage could not be completed.";
  const warning = `Search research unavailable: ${message}`.slice(0, 500);
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
