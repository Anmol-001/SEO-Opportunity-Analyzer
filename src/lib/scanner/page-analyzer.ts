import { load } from "cheerio";

import type {
  AnalyzedPage,
  InternalLink,
  PageType,
} from "./types.ts";

const excludedFileExtension =
  /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|mov|pdf|png|pptx?|rar|rss|svg|tar|ttf|txt|webm|webp|woff2?|xlsx?|xml|zip)$/i;
const trackingParameters = [
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
];

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedDomain(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeDiscoveredUrl(value: string, baseUrl: URL) {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (normalizedDomain(url.hostname) !== normalizedDomain(baseUrl.hostname)) return null;
    if (excludedFileExtension.test(url.pathname)) return null;

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || trackingParameters.includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function extractInternalLinks(html: string, pageUrl: URL): InternalLink[] {
  const $ = load(html);
  const links = new Map<string, string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const url = normalizeDiscoveredUrl(href, pageUrl);
    if (!url || links.has(url)) return;
    const text = normalizeWhitespace($(element).text()).slice(0, 240);
    links.set(url, text);
  });

  return [...links.entries()].slice(0, 150).map(([url, text]) => ({ url, text }));
}

function extractStructuredData(html: string) {
  const $ = load(html);
  const records: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    if (records.length >= 20) return;
    const raw = $(element).text().trim();
    if (!raw || raw.length > 100_000) return;
    try {
      records.push(JSON.parse(raw));
    } catch {
      // Invalid JSON-LD is omitted rather than promoted to evidence.
    }
  });

  return records;
}

function resolveCanonical(value: string | undefined, pageUrl: URL) {
  if (!value) return null;
  try {
    const canonical = new URL(value, pageUrl);
    if (canonical.protocol !== "http:" && canonical.protocol !== "https:") return null;
    canonical.hash = "";
    return canonical.toString();
  } catch {
    return null;
  }
}

export function analyzeHtmlPage({
  headers,
  html,
  pageType,
  url,
}: {
  headers?: Headers;
  html: string;
  pageType: PageType;
  url: string | URL;
}): AnalyzedPage {
  const pageUrl = new URL(url);
  const $ = load(html);
  const structuredData = extractStructuredData(html);
  const internalLinks = extractInternalLinks(html, pageUrl);
  const title = normalizeWhitespace($("title").first().text()) || null;
  const metaDescription =
    normalizeWhitespace($('meta[name="description" i]').first().attr("content") ?? "") || null;
  const h1 = normalizeWhitespace($("h1").first().text()) || null;
  const h2s = $("h2")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 40);
  const imageAlts = [
    ...new Set(
      $("img[alt]")
        .map((_, element) => normalizeWhitespace($(element).attr("alt") ?? ""))
        .get()
        .filter(Boolean),
    ),
  ].slice(0, 100);
  const canonicalUrl = resolveCanonical(
    $('link[rel="canonical" i]').first().attr("href"),
    pageUrl,
  );
  const robotsDirectives = [
    ...$('meta[name="robots" i], meta[name="googlebot" i]')
      .map((_, element) => $(element).attr("content") ?? "")
      .get(),
    headers?.get("x-robots-tag") ?? "",
  ]
    .flatMap((value) => value.split(","))
    .map((value) => normalizeWhitespace(value).toLowerCase())
    .filter(Boolean);

  $("script, style, noscript, template, svg, iframe, canvas").remove();
  const contentRoot = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body").first();
  const fullText = normalizeWhitespace(contentRoot.text());
  const mainText = fullText.slice(0, 100_000);
  const wordCount = mainText ? mainText.split(/\s+/).length : 0;

  return {
    canonicalUrl,
    h1,
    h2s,
    imageAlts,
    internalLinks,
    mainText,
    metaDescription,
    pageType,
    robotsDirectives: [...new Set(robotsDirectives)].slice(0, 30),
    structuredData,
    title,
    url: pageUrl.toString(),
    wordCount,
  };
}
