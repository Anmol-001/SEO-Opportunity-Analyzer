import { meaningfulTerms } from "./discovery.ts";
import type {
  CompetitorPageSignals,
  SubmittedSiteBaseline,
} from "./types.ts";

interface SubmittedPageEvidence {
  h1: string | null;
  h2s: string[];
  mainText: string | null;
  structuredData: unknown;
  wordCount: number | null;
}

function collectStructuredTypes(value: unknown, types = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectStructuredTypes(item, types);
    return types;
  }
  if (!value || typeof value !== "object") return types;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") types.add(type);
  if (Array.isArray(type)) {
    for (const item of type) if (typeof item === "string") types.add(item);
  }
  for (const nested of Object.values(record)) collectStructuredTypes(nested, types);
  return types;
}

export function buildSubmittedSiteBaseline(input: {
  location: string;
  pages: SubmittedPageEvidence[];
  primaryService: string;
}): SubmittedSiteBaseline {
  const text = input.pages
    .flatMap((page) => [page.h1 ?? "", ...page.h2s, page.mainText ?? ""])
    .join(" ")
    .toLowerCase();
  const types = new Set<string>();
  for (const page of input.pages) collectStructuredTypes(page.structuredData, types);
  const serviceTermsMatched = meaningfulTerms(input.primaryService).filter((term) =>
    text.includes(term),
  );
  return {
    faqPresent:
      [...types].some((type) => type.toLowerCase() === "faqpage") ||
      input.pages.some((page) =>
        page.h2s.some((heading) => /\bfaq|frequently asked|questions?\b/i.test(heading)),
      ),
    locationMention: text.includes(input.location.toLowerCase()),
    maxWordCount: Math.max(0, ...input.pages.map((page) => page.wordCount ?? 0)),
    serviceTermsMatched,
    structuredDataTypes: [...types].sort(),
  };
}

export function competitorStrengths(page: CompetitorPageSignals | null) {
  if (!page) return [];
  const strengths: string[] = [];
  if (page.wordCount >= 800) strengths.push(`Substantial page depth (${page.wordCount} words)`);
  if (page.faqPresent) strengths.push("FAQ coverage");
  if (page.structuredDataTypes.length > 0) strengths.push("Structured data present");
  if (page.locationMention) strengths.push("Explicit location targeting");
  if (page.serviceTermsMatched.length > 0) strengths.push("Primary-service coverage");
  if (page.ctaSignals.length > 0) strengths.push("Clear conversion calls to action");
  return strengths;
}

export function compareCompetitorToSubmittedSite(
  page: CompetitorPageSignals | null,
  baseline: SubmittedSiteBaseline,
) {
  if (!page) return [];
  const gaps: string[] = [];
  if (
    page.wordCount >= 500 &&
    page.wordCount > Math.max(250, Math.round(baseline.maxWordCount * 1.25))
  ) {
    gaps.push("Competitor ranking page has materially greater content depth.");
  }
  if (page.faqPresent && !baseline.faqPresent) {
    gaps.push("Competitor uses FAQ coverage that was not found on the submitted pages.");
  }
  if (page.locationMention && !baseline.locationMention) {
    gaps.push("Competitor explicitly targets the requested location.");
  }
  if (page.structuredDataTypes.length > 0 && baseline.structuredDataTypes.length === 0) {
    gaps.push("Competitor uses structured data that was not found on the submitted pages.");
  }
  const unmatchedServiceTerms = page.serviceTermsMatched.filter(
    (term) => !baseline.serviceTermsMatched.includes(term),
  );
  if (unmatchedServiceTerms.length > 0) {
    gaps.push(`Competitor covers additional service terms: ${unmatchedServiceTerms.join(", ")}.`);
  }
  return gaps;
}
