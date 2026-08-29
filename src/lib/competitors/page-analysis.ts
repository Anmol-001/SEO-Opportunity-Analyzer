import { load } from "cheerio";

import { analyzeHtmlPage, normalizeWhitespace } from "../scanner/page-analyzer.ts";
import { isPathAllowedByRobots, parseRobotsTxt } from "../scanner/robots.ts";
import {
  safeFetchText,
  type FetchLike,
  type SafeFetchOptions,
} from "../scanner/safe-fetch.ts";
import type { HostResolver } from "../security/public-url.ts";
import { meaningfulTerms, registrableDomain } from "./discovery.ts";
import type {
  AnalyzedCompetitor,
  CompetitorPageSignals,
  DiscoveredCompetitor,
} from "./types.ts";

export interface CompetitorPageDependencies {
  fetchImpl?: FetchLike;
  resolver?: HostResolver;
}

function fetchOptions(
  dependencies: CompetitorPageDependencies,
  options: SafeFetchOptions,
): SafeFetchOptions {
  return {
    ...options,
    fetchImpl: dependencies.fetchImpl,
    resolver: dependencies.resolver,
  };
}

function structuredDataTypes(value: unknown, types = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) structuredDataTypes(item, types);
    return types;
  }
  if (!value || typeof value !== "object") return types;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") types.add(type);
  if (Array.isArray(type)) {
    for (const item of type) if (typeof item === "string") types.add(item);
  }
  for (const nested of Object.values(record)) structuredDataTypes(nested, types);
  return types;
}

function phrasePresent(text: string, phrase: string) {
  const comparableText = text.replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedPhrase = phrase.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(normalizedPhrase) && comparableText.includes(normalizedPhrase);
}

function extractCtaSignals(text: string) {
  const patterns: Array<[RegExp, string]> = [
    [/\bbook (?:now|online|an appointment|a consultation)\b/i, "booking"],
    [/\b(?:contact|get in touch|talk to us)\b/i, "contact"],
    [/\b(?:call now|call us|phone us)\b/i, "phone"],
    [/\b(?:get|request) (?:a )?(?:free )?(?:quote|estimate|consultation)\b/i, "quote"],
    [/\b(?:buy now|shop now|order now)\b/i, "purchase"],
    [/\b(?:start|get started|try for free|free trial)\b/i, "signup"],
  ];
  return patterns.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

export function deriveCompetitorPageSignals(input: {
  headers?: Headers;
  html: string;
  location: string;
  primaryService: string;
  url: string | URL;
}): CompetitorPageSignals {
  const page = analyzeHtmlPage({
    headers: input.headers,
    html: input.html,
    pageType: "relevant",
    url: input.url,
  });
  const types = [...structuredDataTypes(page.structuredData)].sort();
  const $ = load(input.html);
  $("script, style, noscript, template").remove();
  const actionText = normalizeWhitespace(
    $("a, button, [role='button'], input[type='submit']")
      .map((_, element) => $(element).text() || $(element).attr("value") || "")
      .get()
      .join(" "),
  ).toLowerCase();
  const combinedText = normalizeWhitespace(
    [page.title, page.metaDescription, page.h1, ...page.h2s, page.mainText]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
  const serviceTermsMatched = meaningfulTerms(input.primaryService).filter((term) =>
    combinedText.includes(term),
  );
  const faqPresent =
    types.some((type) => type.toLowerCase() === "faqpage") ||
    page.h2s.some((heading) => /\bfaq|frequently asked|questions?\b/i.test(heading));

  return {
    canonicalUrl: page.canonicalUrl,
    ctaSignals: extractCtaSignals(`${combinedText} ${actionText}`),
    faqPresent,
    h1: page.h1,
    h2s: page.h2s,
    locationMention: phrasePresent(combinedText, input.location),
    metaDescription: page.metaDescription,
    robotsDirectives: page.robotsDirectives,
    serviceTermsMatched,
    structuredDataTypes: types,
    title: page.title,
    url: page.url,
    wordCount: page.wordCount,
  };
}

async function analyzeOneCompetitor(
  candidate: DiscoveredCompetitor,
  input: { location: string; primaryService: string },
  dependencies: CompetitorPageDependencies,
): Promise<AnalyzedCompetitor> {
  const target = candidate.rankingUrls[0];
  if (!target) return { candidate, page: null, warning: "No ranking URL was available." };
  const targetUrl = new URL(target);
  const robotsUrl = new URL("/robots.txt", targetUrl);

  try {
    let rules: ReturnType<typeof parseRobotsTxt>["rules"] = [];
    let robotsWarning: string | null = null;
    try {
      const robots = await safeFetchText(
        robotsUrl,
        fetchOptions(dependencies, {
          acceptedContentTypes: ["text/plain", "text/html"],
          maxBytes: 300_000,
          timeoutMs: 5_000,
        }),
      );
      if (registrableDomain(robots.finalUrl.hostname) !== candidate.domain) {
        robotsWarning = `robots.txt for ${candidate.domain} redirected outside the domain.`;
      } else if (robots.status >= 200 && robots.status < 300) {
        rules = parseRobotsTxt(robots.body).rules;
      } else if (robots.status !== 404) {
        robotsWarning = `robots.txt for ${candidate.domain} returned HTTP ${robots.status}.`;
      }
    } catch (error) {
      robotsWarning = `robots.txt unavailable for ${candidate.domain}: ${
        error instanceof Error ? error.message : "request failed"
      }`.slice(0, 500);
    }
    if (!isPathAllowedByRobots(targetUrl, rules)) {
      return {
        candidate,
        page: null,
        warning: `${targetUrl.pathname} was skipped because robots.txt disallows it.`,
      };
    }

    const response = await safeFetchText(
      targetUrl,
      fetchOptions(dependencies, {
        acceptedContentTypes: ["text/html", "application/xhtml+xml"],
        maxBytes: 1_500_000,
        timeoutMs: 8_000,
      }),
    );
    if (response.status < 200 || response.status >= 300) {
      return {
        candidate,
        page: null,
        warning: `${targetUrl.pathname} returned HTTP ${response.status}.`,
      };
    }
    if (registrableDomain(response.finalUrl.hostname) !== candidate.domain) {
      return {
        candidate,
        page: null,
        warning: `${targetUrl.pathname} redirected outside ${candidate.domain}.`,
      };
    }

    return {
      candidate,
      page: deriveCompetitorPageSignals({
        headers: response.headers,
        html: response.body,
        location: input.location,
        primaryService: input.primaryService,
        url: response.finalUrl,
      }),
      warning: robotsWarning,
    };
  } catch (error) {
    return {
      candidate,
      page: null,
      warning: `Could not analyze ${candidate.domain}: ${
        error instanceof Error ? error.message : "request failed"
      }`.slice(0, 500),
    };
  }
}

export async function analyzeCompetitorPages(
  candidates: DiscoveredCompetitor[],
  input: { location: string; primaryService: string },
  dependencies: CompetitorPageDependencies = {},
  concurrency = 2,
) {
  const selected = candidates.slice(0, 5);
  const results: AnalyzedCompetitor[] = new Array(selected.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, selected.length)) },
    async () => {
      while (nextIndex < selected.length) {
        const index = nextIndex++;
        results[index] = await analyzeOneCompetitor(
          selected[index],
          input,
          dependencies,
        );
      }
    },
  );
  await Promise.all(workers);
  return results;
}
