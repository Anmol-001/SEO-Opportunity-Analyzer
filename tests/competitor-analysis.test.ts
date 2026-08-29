import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubmittedSiteBaseline,
  compareCompetitorToSubmittedSite,
  competitorStrengths,
} from "../src/lib/competitors/comparison.ts";
import { analyzeCompetitorPages } from "../src/lib/competitors/page-analysis.ts";
import type { DiscoveredCompetitor } from "../src/lib/competitors/types.ts";
import type { FetchLike } from "../src/lib/scanner/safe-fetch.ts";
import type { HostResolver } from "../src/lib/security/public-url.ts";

const publicResolver: HostResolver = async () => [
  { address: "93.184.216.34", family: 4 },
];

function candidate(url: string): DiscoveredCompetitor {
  return {
    bestPosition: 2,
    domain: new URL(url).hostname,
    matchedTerms: ["dental", "implants"],
    occurrenceCount: 2,
    queries: ["dental implants noida", "implant cost noida"],
    rankingUrls: [url],
    relevanceScore: 1,
    selectionScore: 250,
    type: "direct",
  };
}

test("respects robots and extracts bounded competitor page signals", async () => {
  const allowed = candidate("https://alpha.example/services/implants");
  const blocked = candidate("https://blocked.example/private/implants");
  const calls: string[] = [];
  const longCopy = Array.from({ length: 810 }, () => "implant").join(" ");
  const responses = new Map<string, Response>([
    [
      "https://alpha.example/robots.txt",
      new Response("User-agent: *\nDisallow:", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ],
    [
      "https://alpha.example/services/implants",
      new Response(
        `<!doctype html><html><head><title>Dental implants in Noida, India</title><meta name="description" content="Book dental implant care"><script type="application/ld+json">{"@type":"FAQPage"}</script></head><body><main><h1>Dental implants</h1><h2>Frequently asked questions</h2><p>${longCopy}</p><a href="/contact">Book a consultation</a></main></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    ],
    [
      "https://blocked.example/robots.txt",
      new Response("User-agent: *\nDisallow: /private", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ],
  ]);
  const fetchImpl: FetchLike = async (input) => {
    const url = input.toString();
    calls.push(url);
    const response = responses.get(url);
    if (!response) throw new Error(`Unexpected request: ${url}`);
    return response.clone();
  };

  const analyzed = await analyzeCompetitorPages(
    [allowed, blocked],
    { location: "Noida, India", primaryService: "Dental implants" },
    { fetchImpl, resolver: publicResolver },
    1,
  );

  assert.equal(analyzed[0].page?.faqPresent, true);
  assert.equal(analyzed[0].page?.locationMention, true);
  assert.ok((analyzed[0].page?.wordCount ?? 0) >= 800);
  assert.deepEqual(analyzed[0].page?.structuredDataTypes, ["FAQPage"]);
  assert.deepEqual(analyzed[0].page?.ctaSignals, ["booking"]);
  assert.equal(analyzed[1].page, null);
  assert.match(analyzed[1].warning ?? "", /robots\.txt disallows/i);
  assert.equal(calls.includes("https://blocked.example/private/implants"), false);
});

test("derives evidence-backed strengths and submitted-site gaps", () => {
  const baseline = buildSubmittedSiteBaseline({
    location: "Noida, India",
    primaryService: "Dental implants",
    pages: [
      {
        h1: "Dental implants",
        h2s: ["Treatment options"],
        mainText: "Dental implant care overview.",
        structuredData: [],
        wordCount: 300,
      },
    ],
  });
  const page = {
    canonicalUrl: null,
    ctaSignals: ["booking"],
    faqPresent: true,
    h1: "Dental implants in Noida",
    h2s: ["Frequently asked questions"],
    locationMention: true,
    metaDescription: null,
    robotsDirectives: [],
    serviceTermsMatched: ["dental", "implants"],
    structuredDataTypes: ["FAQPage"],
    title: "Implant clinic",
    url: "https://alpha.example/implants",
    wordCount: 900,
  };

  assert.deepEqual(competitorStrengths(page), [
    "Substantial page depth (900 words)",
    "FAQ coverage",
    "Structured data present",
    "Explicit location targeting",
    "Primary-service coverage",
    "Clear conversion calls to action",
  ]);
  assert.deepEqual(compareCompetitorToSubmittedSite(page, baseline), [
    "Competitor ranking page has materially greater content depth.",
    "Competitor uses FAQ coverage that was not found on the submitted pages.",
    "Competitor explicitly targets the requested location.",
    "Competitor uses structured data that was not found on the submitted pages.",
  ]);
});
