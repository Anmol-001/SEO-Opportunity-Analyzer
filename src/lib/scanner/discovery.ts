import { load } from "cheerio";

import { normalizeDiscoveredUrl } from "./page-analyzer.ts";
import type { InternalLink, PageType, SelectedPage } from "./types.ts";

const stopWords = new Set([
  "and",
  "for",
  "from",
  "near",
  "our",
  "the",
  "with",
  "your",
]);

function tokens(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\p{L}]+/gu, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !stopWords.has(token)),
    ),
  ];
}

export function parseSitemapDocument(xml: string, baseUrl: URL) {
  const $ = load(xml, { xml: true });
  const isIndex = $("sitemapindex").length > 0;
  const selector = isIndex ? "sitemap > loc" : "url > loc";
  const urls = new Set<string>();

  $(selector).each((_, element) => {
    const value = $(element).text().trim();
    if (!value) return;
    try {
      const url = new URL(value, baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      url.hash = "";
      urls.add(url.toString());
    } catch {
      // Ignore malformed sitemap records.
    }
  });

  return {
    isIndex,
    urls: [...urls],
  };
}

interface Candidate {
  pageType: PageType;
  reason: string;
  score: number;
  url: string;
}

function scoreCandidate({
  anchorText,
  locationTokens,
  serviceTokens,
  url,
}: {
  anchorText: string;
  locationTokens: string[];
  serviceTokens: string[];
  url: string;
}): Candidate {
  const parsed = new URL(url);
  let decodedPath = parsed.pathname;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    // Keep the encoded path if it cannot be decoded safely.
  }

  const haystack = `${decodedPath.replace(/[-_/]+/g, " ")} ${anchorText}`.toLowerCase();
  const serviceMatches = serviceTokens.filter((token) => haystack.includes(token)).length;
  const locationMatches = locationTokens.filter((token) => haystack.includes(token)).length;
  const hasService = serviceMatches > 0;
  const hasLocation = locationMatches > 0;
  const depth = parsed.pathname.split("/").filter(Boolean).length;
  let score = serviceMatches * 12 + locationMatches * 10 - Math.max(0, depth - 2) * 2;

  if (/\b(service|services|solution|solutions|product|products|treatment|treatments)\b/.test(haystack)) {
    score += 5;
  }
  if (/\b(location|locations|area|areas|city|cities|clinic|office|branch)\b/.test(haystack)) {
    score += 4;
  }
  if (/\b(contact|privacy|terms|login|sign in|cart|checkout|author|tag|category)\b/.test(haystack)) {
    score -= 20;
  }
  if (/\b(blog|news|insight|article)\b/.test(haystack)) score -= 5;

  const pageType: PageType = hasService && hasLocation
    ? "service-location"
    : hasService
      ? "service"
      : hasLocation
        ? "location"
        : "relevant";

  return {
    pageType,
    reason:
      pageType === "service-location"
        ? "Matches both the primary service and target location."
        : pageType === "service"
          ? "Matches the primary service or product."
          : pageType === "location"
            ? "Matches the target location."
            : "Relevant internal page discovered from the site.",
    score,
    url,
  };
}

export function selectRelevantPages({
  homepageUrl,
  internalLinks,
  location,
  maxPages = 5,
  primaryService,
  sitemapUrls,
}: {
  homepageUrl: string;
  internalLinks: InternalLink[];
  location: string;
  maxPages?: number;
  primaryService: string;
  sitemapUrls: string[];
}): SelectedPage[] {
  const homepage = new URL(homepageUrl);
  const candidates = new Map<string, { anchorText: string; url: string }>();

  for (const link of internalLinks) {
    const normalized = normalizeDiscoveredUrl(link.url, homepage);
    if (!normalized || normalized === homepage.toString()) continue;
    candidates.set(normalized, { anchorText: link.text, url: normalized });
  }

  for (const value of sitemapUrls) {
    const normalized = normalizeDiscoveredUrl(value, homepage);
    if (!normalized || normalized === homepage.toString()) continue;
    const existing = candidates.get(normalized);
    candidates.set(normalized, {
      anchorText: existing?.anchorText ?? "",
      url: normalized,
    });
  }

  const serviceTokens = tokens(primaryService);
  const locationTokens = tokens(location);
  const scored = [...candidates.values()]
    .map((candidate) =>
      scoreCandidate({
        ...candidate,
        locationTokens,
        serviceTokens,
      }),
    )
    .filter((candidate) => candidate.score > -10)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  const selected: SelectedPage[] = [
    {
      pageType: "homepage",
      reason: "Homepage is always included as the primary website sample.",
      score: Number.POSITIVE_INFINITY,
      url: homepage.toString(),
    },
  ];
  const selectedUrls = new Set(selected.map((page) => page.url));

  const pick = (predicate: (candidate: Candidate) => boolean) => {
    const candidate = scored.find(
      (item) => predicate(item) && !selectedUrls.has(item.url),
    );
    if (!candidate || selected.length >= maxPages) return;
    selected.push(candidate);
    selectedUrls.add(candidate.url);
  };

  pick((candidate) => candidate.pageType === "service");
  pick((candidate) => candidate.pageType === "location");
  pick((candidate) => candidate.pageType === "service-location");

  for (const candidate of scored) {
    if (selected.length >= maxPages) break;
    if (selectedUrls.has(candidate.url)) continue;
    selected.push(candidate);
    selectedUrls.add(candidate.url);
  }

  return selected;
}
