import type { OpportunityScoringResult } from "../scoring/types.ts";
import type {
  CompetitorEvidenceItem,
  SerpEvidenceItem,
  SynthesisEvidencePacket,
  SynthesisSource,
  WebsiteEvidenceItem,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => boundedText(item, 300))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function boundedText(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function quoted(value: string | null, fallback: string) {
  const text = value ? boundedText(value, 180) : "";
  return text ? `“${text}”` : fallback;
}

function structuredDataPresent(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function serpFeatures(value: unknown) {
  if (!isRecord(value)) return [];
  return stringArray(value.serpFeatures, 10);
}

function competitorDiscovery(value: unknown) {
  if (!isRecord(value) || !isRecord(value.discovery)) return null;
  return value.discovery;
}

export function buildSynthesisEvidencePacket(
  source: SynthesisSource,
  scoring: OpportunityScoringResult,
): SynthesisEvidencePacket {
  const website: WebsiteEvidenceItem[] = source.pages.slice(0, 5).map((page, index) => {
    const pageType = boundedText(page.pageType ?? "page", 80) || "page";
    const structured = structuredDataPresent(page.structuredData);
    const headingCount = page.h2s.length;
    const evidence = [
      `${pageType} ${quoted(page.title, "has no detected title")}`,
      `H1 ${quoted(page.h1, "not detected")}`,
      `${page.wordCount ?? "unknown"} words`,
      `${headingCount} H2 heading${headingCount === 1 ? "" : "s"}`,
      `structured data ${structured ? "detected" : "not detected"}`,
    ].join("; ");
    return {
      evidence,
      h1Present: Boolean(page.h1),
      id: `W${String(index + 1).padStart(3, "0")}`,
      pageType,
      structuredDataPresent: structured,
      titlePresent: Boolean(page.title),
      wordCount: page.wordCount,
    };
  });

  const scoringByKeyword = new Map(
    scoring.keywords.map((keyword) => [keyword.keyword, keyword]),
  );
  const serp: SerpEvidenceItem[] = [...source.keywords]
    .sort((a, b) => a.keyword.localeCompare(b.keyword))
    .slice(0, 8)
    .map((keyword, index) => {
      const features = serpFeatures(keyword.evidence);
      const score = scoringByKeyword.get(keyword.keyword);
      const ranking = keyword.rankingPosition === null
        ? "submitted domain not found in the collected organic results"
        : `submitted domain ranked #${keyword.rankingPosition}`;
      const evidence = [
        `Query “${boundedText(keyword.keyword, 160)}”`,
        ranking,
        `${keyword.competitorFrequency} direct competitor${keyword.competitorFrequency === 1 ? "" : "s"} observed`,
        features.length ? `SERP features: ${features.join(", ")}` : "no normalized SERP features recorded",
        score ? `deterministic priority ${score.priorityScore}/100 (${score.priority})` : "priority unavailable",
      ].join("; ");
      return {
        competitorFrequency: keyword.competitorFrequency,
        evidence,
        features,
        id: `S${String(index + 1).padStart(3, "0")}`,
        intent: boundedText(keyword.intent ?? "unknown", 80) || "unknown",
        keyword: boundedText(keyword.keyword, 160),
        rankingPosition: keyword.rankingPosition,
      };
    });

  const competitors: CompetitorEvidenceItem[] = [...source.competitors]
    .filter((competitor) => competitor.type === "direct")
    .sort(
      (a, b) =>
        b.occurrenceCount - a.occurrenceCount || a.domain.localeCompare(b.domain),
    )
    .slice(0, 5)
    .map((competitor, index) => {
      const strengths = stringArray(competitor.strengths, 5);
      const gaps = stringArray(competitor.gap, 5);
      const discovery = competitorDiscovery(competitor.evidence);
      const bestPosition =
        typeof discovery?.bestPosition === "number" ? discovery.bestPosition : null;
      const analyzed = isRecord(competitor.evidence) && isRecord(competitor.evidence.page);
      const evidence = [
        `${boundedText(competitor.domain, 253)} appeared across ${competitor.occurrenceCount} query result set${competitor.occurrenceCount === 1 ? "" : "s"}`,
        bestPosition === null ? "best position unavailable" : `best observed position #${bestPosition}`,
        analyzed ? "ranking page analysis available" : "ranking page analysis unavailable",
      ].join("; ");
      return {
        domain: boundedText(competitor.domain, 253),
        evidence,
        gap: gaps.join(" "),
        id: `C${String(index + 1).padStart(3, "0")}`,
        positioning: boundedText(competitor.positioning ?? "", 500),
        strengths,
        type: competitor.type,
      };
    });

  return {
    business: {
      businessName: boundedText(source.businessName, 120),
      industry: boundedText(source.industry, 100),
      location: boundedText(source.location, 120),
      mainGoal: boundedText(source.mainGoal, 500),
      primaryService: boundedText(source.primaryService, 160),
      websiteUrl: boundedText(source.websiteUrl, 2_048),
    },
    competitors,
    score: {
      components: scoring.components,
      formulaVersion: scoring.formulaVersion,
      overallScore: scoring.overallScore,
      weights: scoring.weights,
    },
    serp,
    website,
  };
}
