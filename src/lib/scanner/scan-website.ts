import { normalizedDomain } from "../validation/assessment.ts";
import { parseSitemapDocument, selectRelevantPages } from "./discovery.ts";
import { analyzeHtmlPage } from "./page-analyzer.ts";
import {
  emptyRobotsPolicy,
  isPathAllowedByRobots,
  parseRobotsTxt,
} from "./robots.ts";
import {
  safeFetchText,
  type FetchLike,
  type SafeFetchOptions,
} from "./safe-fetch.ts";
import type {
  RobotsPolicy,
  WebsiteScanResult,
} from "./types.ts";
import type { HostResolver } from "../security/public-url.ts";

export interface ScanWebsiteInput {
  location: string;
  primaryService: string;
  websiteUrl: string;
}

export interface ScannerDependencies {
  fetchImpl?: FetchLike;
  resolver?: HostResolver;
}

export class WebsiteScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteScanError";
  }
}

const htmlContentTypes = ["text/html", "application/xhtml+xml"];
const sitemapContentTypes = [
  "application/xml",
  "application/xhtml+xml",
  "text/xml",
  "text/plain",
];

function fetchOptions(
  dependencies: ScannerDependencies,
  options: SafeFetchOptions,
): SafeFetchOptions {
  return {
    ...options,
    fetchImpl: dependencies.fetchImpl,
    resolver: dependencies.resolver,
  };
}

async function fetchRobots(
  homepageUrl: URL,
  dependencies: ScannerDependencies,
  warnings: string[],
): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", homepageUrl);

  try {
    const response = await safeFetchText(
      robotsUrl,
      fetchOptions(dependencies, {
        acceptedContentTypes: ["text/plain", "text/html"],
        maxBytes: 300_000,
        timeoutMs: 6_000,
      }),
    );
    const policy: RobotsPolicy = {
      fetched: response.status >= 200 && response.status < 300,
      finalUrl: response.finalUrl.toString(),
      rules: [],
      sitemaps: [],
      status: response.status,
    };

    if (policy.fetched) {
      const parsed = parseRobotsTxt(response.body);
      policy.rules = parsed.rules;
      policy.sitemaps = parsed.sitemaps;
    } else if (response.status !== 404) {
      warnings.push(`robots.txt returned HTTP ${response.status}.`);
    }

    return policy;
  } catch (error) {
    warnings.push(
      `robots.txt unavailable: ${error instanceof Error ? error.message : "request failed"}`,
    );
    return emptyRobotsPolicy();
  }
}

async function discoverSitemapPages(
  homepageUrl: URL,
  robots: RobotsPolicy,
  dependencies: ScannerDependencies,
  warnings: string[],
) {
  const rootCandidates = [
    ...robots.sitemaps,
    new URL("/sitemap.xml", homepageUrl).toString(),
  ];
  const uniqueRoots = [...new Set(rootCandidates)].slice(0, 4);
  const pageUrls = new Set<string>();
  let firstSuccessfulSitemap: string | null = null;
  let childBudget = 3;

  const readSitemap = async (value: string, allowChildren: boolean) => {
    const response = await safeFetchText(
      value,
      fetchOptions(dependencies, {
        acceptedContentTypes: sitemapContentTypes,
        maxBytes: 1_500_000,
        timeoutMs: 7_000,
      }),
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }

    firstSuccessfulSitemap ??= response.finalUrl.toString();
    const document = parseSitemapDocument(response.body, response.finalUrl);
    if (!document.isIndex) {
      for (const pageUrl of document.urls) {
        pageUrls.add(pageUrl);
        if (pageUrls.size >= 200) break;
      }
      return;
    }

    if (!allowChildren) return;
    for (const childUrl of document.urls) {
      if (childBudget <= 0 || pageUrls.size >= 200) break;
      childBudget -= 1;
      try {
        await readSitemap(childUrl, false);
      } catch (error) {
        warnings.push(
          `Child sitemap unavailable: ${error instanceof Error ? error.message : "request failed"}`,
        );
      }
    }
  };

  for (const candidate of uniqueRoots) {
    if (pageUrls.size >= 200) break;
    try {
      await readSitemap(candidate, true);
    } catch (error) {
      if (candidate !== new URL("/sitemap.xml", homepageUrl).toString()) {
        warnings.push(
          `Declared sitemap unavailable: ${error instanceof Error ? error.message : "request failed"}`,
        );
      }
    }
  }

  return {
    pageUrls: [...pageUrls].slice(0, 200),
    sitemapUrl: firstSuccessfulSitemap,
  };
}

export async function scanWebsite(
  input: ScanWebsiteInput,
  dependencies: ScannerDependencies = {},
): Promise<WebsiteScanResult> {
  const warnings: string[] = [];
  const homepageResponse = await safeFetchText(
    input.websiteUrl,
    fetchOptions(dependencies, {
      acceptedContentTypes: htmlContentTypes,
      maxBytes: 2_000_000,
      timeoutMs: 9_000,
    }),
  );

  if (homepageResponse.status < 200 || homepageResponse.status >= 300) {
    throw new WebsiteScanError(`Homepage returned HTTP ${homepageResponse.status}.`);
  }

  const homepageUrl = homepageResponse.finalUrl;
  const homepageDomain = normalizedDomain(homepageUrl.toString());
  const homepage = analyzeHtmlPage({
    headers: homepageResponse.headers,
    html: homepageResponse.body,
    pageType: "homepage",
    url: homepageUrl,
  });
  const robots = await fetchRobots(homepageUrl, dependencies, warnings);
  const sitemap = await discoverSitemapPages(
    homepageUrl,
    robots,
    dependencies,
    warnings,
  );
  const selectedPages = selectRelevantPages({
    homepageUrl: homepageUrl.toString(),
    internalLinks: homepage.internalLinks,
    location: input.location,
    primaryService: input.primaryService,
    sitemapUrls: sitemap.pageUrls,
  });
  const pages = [homepage];

  for (const selected of selectedPages.slice(1)) {
    const selectedUrl = new URL(selected.url);
    if (!isPathAllowedByRobots(selectedUrl, robots.rules)) {
      warnings.push(`Skipped ${selectedUrl.pathname}: disallowed by robots.txt.`);
      continue;
    }

    try {
      const response = await safeFetchText(
        selectedUrl,
        fetchOptions(dependencies, {
          acceptedContentTypes: htmlContentTypes,
          maxBytes: 2_000_000,
          timeoutMs: 8_000,
        }),
      );
      if (response.status < 200 || response.status >= 300) {
        warnings.push(`${selectedUrl.pathname} returned HTTP ${response.status}.`);
        continue;
      }
      if (normalizedDomain(response.finalUrl.toString()) !== homepageDomain) {
        warnings.push(`${selectedUrl.pathname} redirected outside the submitted website.`);
        continue;
      }

      pages.push(
        analyzeHtmlPage({
          headers: response.headers,
          html: response.body,
          pageType: selected.pageType,
          url: response.finalUrl,
        }),
      );
    } catch (error) {
      warnings.push(
        `Could not scan ${selectedUrl.pathname}: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  }

  return {
    homepageUrl: homepageUrl.toString(),
    pages,
    robots,
    sitemapUrl: sitemap.sitemapUrl,
    warnings: [...new Set(warnings)].slice(0, 30),
  };
}
