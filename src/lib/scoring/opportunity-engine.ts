import { meaningfulTerms } from "../competitors/discovery.ts";
import type {
  OpportunityPriority,
  OpportunityScoringResult,
  ScoredKeywordOpportunity,
  ScoringCompetitorEvidence,
  ScoringKeywordEvidence,
  ScoringPageEvidence,
} from "./types.ts";

const weights = {
  competitiveGaps: 0.15,
  currentRankingOpportunity: 0.2,
  keywordOpportunity: 0.25,
  serpOpportunity: 0.2,
  websiteReadiness: 0.2,
} as const;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function evidenceFeatures(evidence: unknown) {
  if (!isRecord(evidence)) return [];
  return jsonArray(evidence.serpFeatures).filter(
    (feature): feature is string => typeof feature === "string",
  );
}

function hasAvailableSerp(evidence: unknown) {
  return isRecord(evidence) && evidence.status === "available";
}

function keywordBusinessRelevance(
  keyword: string,
  businessTerms: string[],
) {
  const keywordTerms = meaningfulTerms(keyword);
  if (keywordTerms.length === 0 || businessTerms.length === 0) return 0;
  const matched = keywordTerms.filter((term) => businessTerms.includes(term));
  return clamp(Math.round((matched.length / keywordTerms.length) * 100));
}

function keywordContentCoverage(keyword: string, pages: ScoringPageEvidence[]) {
  const terms = meaningfulTerms(keyword);
  if (terms.length === 0 || pages.length === 0) return 0;
  const termScores = terms.map((term) => {
    let best = 0;
    for (const page of pages) {
      const titleAndH1 = normalizedText(`${page.title ?? ""} ${page.h1 ?? ""}`);
      const supportingHeadings = normalizedText(
        `${page.metaDescription ?? ""} ${page.h2s.join(" ")}`,
      );
      const body = normalizedText(page.mainText ?? "");
      if (titleAndH1.includes(term)) best = Math.max(best, 1);
      if (supportingHeadings.includes(term)) best = Math.max(best, 0.75);
      if (body.includes(term)) best = Math.max(best, 0.4);
    }
    return best;
  });
  const exactPhrase = normalizedText(keyword);
  const exactMatch = pages.some((page) =>
    normalizedText(
      `${page.title ?? ""} ${page.h1 ?? ""} ${page.metaDescription ?? ""} ${page.mainText ?? ""}`,
    ).includes(exactPhrase),
  );
  return Number(Math.max(average(termScores), exactMatch ? 0.8 : 0).toFixed(3));
}

export function rankingOpportunityScore(rankingPosition: number | null) {
  if (rankingPosition === null) return 65;
  if (rankingPosition <= 3) return 35;
  if (rankingPosition <= 10) return 95;
  if (rankingPosition <= 20) return 90;
  if (rankingPosition <= 50) return 75;
  return 60;
}

function intentValue(intent: string | null) {
  switch (intent) {
    case "transactional":
      return 90;
    case "commercial":
    case "local":
      return 80;
    case "informational":
      return 60;
    default:
      return 65;
  }
}

function priorityLabel(score: number): OpportunityPriority {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function keywordRationale(input: {
  competitorFrequency: number;
  contentCoverage: number;
  opportunityType: "existing" | "potential";
  rankingPosition: number | null;
}) {
  const competitorText =
    input.competitorFrequency > 0
      ? ` ${input.competitorFrequency} direct competitor${input.competitorFrequency === 1 ? "" : "s"} appeared in the collected results.`
      : " No direct-competitor recurrence was detected for this query.";
  if (input.rankingPosition !== null) {
    return `The submitted domain ranks #${input.rankingPosition}, so this is an existing visibility opportunity.${competitorText} Search-volume data is unavailable.`;
  }
  if (input.opportunityType === "existing") {
    return `Relevant on-site coverage (${Math.round(input.contentCoverage * 100)}%) exists, but the submitted domain was not found in the collected results.${competitorText} Search-volume data is unavailable.`;
  }
  return `No current ranking or sufficiently relevant submitted page was found (${Math.round(input.contentCoverage * 100)}% coverage).${competitorText} Search-volume data is unavailable.`;
}

function structuredDataPresent(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function websiteReadiness(pages: ScoringPageEvidence[]) {
  if (pages.length === 0) return 0;
  const homepage = pages.find((page) => page.pageType === "homepage") ?? pages[0];
  const maxWordCount = Math.max(0, ...pages.map((page) => page.wordCount ?? 0));
  const hasServicePage = pages.some((page) =>
    ["service", "service-location"].includes(page.pageType ?? ""),
  );
  const hasLocationPage = pages.some((page) =>
    ["location", "service-location"].includes(page.pageType ?? ""),
  );
  return clamp(
    Math.round(
      Math.min(20, pages.length * 4) +
        (homepage.title ? 10 : 0) +
        (homepage.metaDescription ? 10 : 0) +
        (homepage.h1 ? 10 : 0) +
        Math.min(20, (maxWordCount / 800) * 20) +
        (pages.some((page) => structuredDataPresent(page.structuredData)) ? 10 : 0) +
        (hasServicePage ? 10 : 0) +
        (hasLocationPage ? 10 : 0),
    ),
  );
}

function competitorGapScore(competitors: ScoringCompetitorEvidence[]) {
  const direct = competitors.filter((competitor) => competitor.type === "direct");
  if (direct.length === 0) return 0;
  const analyzed = direct.filter(
    (competitor) => isRecord(competitor.evidence) && competitor.evidence.page,
  );
  const totalGaps = direct.reduce(
    (total, competitor) => total + jsonArray(competitor.gap).length,
    0,
  );
  return clamp(25 + analyzed.length * 5 + totalGaps * 10);
}

function serpOpportunityScore(keywords: ScoringKeywordEvidence[]) {
  const available = keywords.filter((keyword) => hasAvailableSerp(keyword.evidence));
  return Math.round(
    average(
      available.map((keyword) =>
        clamp(
          35 +
            Math.min(35, evidenceFeatures(keyword.evidence).length * 10) +
            Math.min(30, keyword.competitorFrequency * 5),
        ),
      ),
    ),
  );
}

export function scoreSeoOpportunity(input: {
  competitors: ScoringCompetitorEvidence[];
  industry: string;
  keywords: ScoringKeywordEvidence[];
  location: string;
  pages: ScoringPageEvidence[];
  primaryService: string;
}): OpportunityScoringResult {
  const businessTerms = meaningfulTerms(
    input.primaryService,
    input.industry,
    input.location,
  );
  const sortedKeywords = [...input.keywords].sort((a, b) =>
    a.keyword.localeCompare(b.keyword),
  );
  const keywords: ScoredKeywordOpportunity[] = sortedKeywords.map((keyword, index) => {
    const businessRelevance = keywordBusinessRelevance(keyword.keyword, businessTerms);
    const contentCoverage = keywordContentCoverage(keyword.keyword, input.pages);
    const rankingOpportunity = rankingOpportunityScore(keyword.rankingPosition);
    const competitorEvidence = clamp(keyword.competitorFrequency * 20);
    const contentGap = Math.round((1 - contentCoverage) * 100);
    const queryIntentValue = intentValue(keyword.intent);
    const priorityScore = clamp(
      Math.round(
        businessRelevance * 0.3 +
          rankingOpportunity * 0.25 +
          contentGap * 0.2 +
          competitorEvidence * 0.15 +
          queryIntentValue * 0.1,
      ),
    );
    const opportunityType =
      keyword.rankingPosition !== null ||
      (contentCoverage >= 0.8 && businessRelevance >= 50)
        ? "existing"
        : "potential";
    return {
      contentCoverage,
      findingId: `K${String(index + 1).padStart(3, "0")}`,
      intent: keyword.intent ?? "unknown",
      keyword: keyword.keyword,
      opportunityType,
      priority: priorityLabel(priorityScore),
      priorityScore,
      rankingPosition: keyword.rankingPosition,
      rankingUrl: keyword.rankingUrl,
      rationale: keywordRationale({
        competitorFrequency: keyword.competitorFrequency,
        contentCoverage,
        opportunityType,
        rankingPosition: keyword.rankingPosition,
      }),
      signals: {
        businessRelevance,
        competitorEvidence,
        contentGap,
        intentValue: queryIntentValue,
        rankingOpportunity,
      },
      websiteRelevance: Number((businessRelevance / 100).toFixed(3)),
    };
  });
  const components = {
    competitiveGaps: competitorGapScore(input.competitors),
    currentRankingOpportunity: Math.round(
      average(keywords.map((keyword) => keyword.signals.rankingOpportunity)),
    ),
    keywordOpportunity: Math.round(
      average(keywords.map((keyword) => keyword.priorityScore)),
    ),
    serpOpportunity: serpOpportunityScore(input.keywords),
    websiteReadiness: websiteReadiness(input.pages),
  };
  const overallScore = clamp(
    Math.round(
      components.websiteReadiness * weights.websiteReadiness +
        components.keywordOpportunity * weights.keywordOpportunity +
        components.currentRankingOpportunity * weights.currentRankingOpportunity +
        components.serpOpportunity * weights.serpOpportunity +
        components.competitiveGaps * weights.competitiveGaps,
    ),
  );
  const directCompetitors = input.competitors.filter(
    (competitor) => competitor.type === "direct",
  );

  return {
    components,
    coverage: {
      analyzedCompetitors: directCompetitors.filter(
        (competitor) => isRecord(competitor.evidence) && competitor.evidence.page,
      ).length,
      directCompetitors: directCompetitors.length,
      keywordMetricsAvailable: false,
      keywords: keywords.length,
      serpQueriesAvailable: input.keywords.filter((keyword) =>
        hasAvailableSerp(keyword.evidence),
      ).length,
      websitePages: input.pages.length,
    },
    formulaVersion: "1.0",
    keywords,
    overallScore,
    weights,
  };
}
