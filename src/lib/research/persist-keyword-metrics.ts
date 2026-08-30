import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  createGoogleAdsKeywordMetricsProviderFromEnv,
  GoogleAdsProviderError,
} from "@/lib/providers/google-ads";
import type { KeywordMetricsProvider } from "@/lib/providers/seo-provider";

function normalizeWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((warning): warning is string => typeof warning === "string")
    : [];
}

function withoutMetricWarnings(warnings: string[]) {
  return warnings.filter(
    (warning) => !warning.toLowerCase().startsWith("keyword metrics unavailable:"),
  );
}

function metricKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMetric(metric: {
  cpc: number | null;
  paidCompetitionSignal: number | null;
  searchVolume: number | null;
}) {
  return (
    metric.searchVolume !== null ||
    metric.cpc !== null ||
    metric.paidCompetitionSignal !== null
  );
}

export interface KeywordMetricPersistenceDependencies {
  provider?: KeywordMetricsProvider | null;
}

export async function collectAndPersistKeywordMetrics(
  submissionId: string,
  dependencies: KeywordMetricPersistenceDependencies = {},
) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      location: true,
      warnings: true,
      keywords: {
        orderBy: { keyword: "asc" },
        select: { evidence: true, keyword: true },
      },
    },
  });
  if (!submission) throw new Error("Submission not found for keyword metrics.");
  if (submission.keywords.length === 0) {
    throw new GoogleAdsProviderError(
      "No researched keywords are available for Google Ads metrics.",
    );
  }

  const provider =
    dependencies.provider === undefined
      ? createGoogleAdsKeywordMetricsProviderFromEnv()
      : dependencies.provider;
  if (!provider) {
    throw new GoogleAdsProviderError(
      "Google Ads keyword metrics are not configured.",
    );
  }
  const locations = await provider.getLocations(submission.location);
  const location = locations[0];
  if (!location) {
    throw new GoogleAdsProviderError(
      "Google Ads could not resolve the assessment location.",
    );
  }
  const metrics = await provider.getKeywordMetrics({
    keywords: submission.keywords.map((keyword) => keyword.keyword),
    location,
  });
  const metricByKeyword = new Map(
    metrics.map((metric) => [metricKey(metric.keyword), metric]),
  );
  const writes = submission.keywords.map((keyword) => {
    const metric = metricByKeyword.get(metricKey(keyword.keyword)) ?? {
      keyword: keyword.keyword,
      searchVolume: null,
      cpc: null,
      paidCompetitionSignal: null,
      monthlyTrend: null,
    };
    const available = hasMetric(metric);
    const evidence = isRecord(keyword.evidence) ? keyword.evidence : {};
    return db.keyword.update({
      where: {
        submissionId_keyword: { submissionId, keyword: keyword.keyword },
      },
      data: {
        searchVolume: metric.searchVolume,
        cpc: metric.cpc,
        paidCompetitionSignal: metric.paidCompetitionSignal,
        monthlyTrend:
          metric.monthlyTrend === null
            ? Prisma.DbNull
            : (metric.monthlyTrend as unknown as Prisma.InputJsonValue),
        evidence: {
          ...evidence,
          keywordMetrics: {
            provider: provider.name,
            status: available ? "available" : "unavailable",
            searchLocation: {
              id: location.id,
              name: location.name,
              countryCode: location.countryCode,
            },
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  });
  const availableCount = metrics.filter(hasMetric).length;
  const warning =
    availableCount === 0
      ? "Keyword metrics unavailable: Google Ads returned no usable historical metrics."
      : null;
  const warnings = withoutMetricWarnings(normalizeWarnings(submission.warnings));
  if (warning) warnings.push(warning);
  await db.$transaction([
    ...writes,
    db.submission.update({
      where: { id: submissionId },
      data: { warnings: warnings as Prisma.InputJsonValue },
    }),
  ]);
  return {
    availableCount,
    keywordCount: submission.keywords.length,
    location,
    provider: provider.name,
    warning,
  };
}

export async function persistKeywordMetricsFailure(
  submissionId: string,
  error: unknown,
) {
  const message =
    error instanceof GoogleAdsProviderError
      ? error.message
      : "The Google Ads metrics stage could not be completed.";
  const warning = `Keyword metrics unavailable: ${message}`.slice(0, 500);
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: { warnings: true },
  });
  if (!submission) return warning;
  const warnings = withoutMetricWarnings(normalizeWarnings(submission.warnings));
  warnings.push(warning);
  await db.submission.update({
    where: { id: submissionId },
    data: { warnings: [...new Set(warnings)] as Prisma.InputJsonValue },
  });
  return warning;
}
