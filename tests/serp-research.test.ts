import assert from "node:assert/strict";
import test from "node:test";

import type {
  SearchLocation,
  SeoProvider,
  SerpSnapshot,
} from "../src/lib/providers/seo-provider.ts";
import type { DiscoveredQuery } from "../src/lib/research/query-discovery.ts";
import {
  domainMatchesSubmission,
  findSubmittedDomainRanking,
  researchSearchLandscape,
} from "../src/lib/research/serp-research.ts";

const location: SearchLocation = {
  id: "serper:noida-india",
  name: "Noida, India",
  countryCode: "in",
};

function snapshot(keyword: string): SerpSnapshot {
  return {
    keyword,
    location: location.name,
    organicResults: [
      {
        position: 6,
        url: "https://blog.example.com/ranking-page",
        domain: "blog.example.com",
        title: "Example",
        snippet: null,
      },
    ],
    features: ["people_also_ask"],
    relatedSearches: [],
    providerReference: null,
  };
}

test("keeps query order and isolates individual provider failures", async () => {
  const queries: DiscoveredQuery[] = [
    { keyword: "query one", cluster: "core", intent: "commercial" },
    { keyword: "query two", cluster: "pricing", intent: "transactional" },
    { keyword: "query three", cluster: "local", intent: "local" },
  ];
  const provider: SeoProvider = {
    name: "serper",
    getLocations: async () => [location],
    getKeywordMetrics: async () => [],
    getSerp: async ({ keyword }) => {
      if (keyword === "query two") throw new Error("temporary failure");
      return snapshot(keyword);
    },
  };

  const result = await researchSearchLandscape(
    { location: location.name, queries },
    provider,
    2,
  );

  assert.deepEqual(
    result.queries.map((item) => item.query.keyword),
    queries.map((query) => query.keyword),
  );
  assert.equal(result.queries[1].snapshot, null);
  assert.match(result.queries[1].warning ?? "", /temporary failure/);
  assert.equal(result.warnings.length, 1);
});

test("detects submitted-domain rankings across www and subdomains", () => {
  const ranking = findSubmittedDomainRanking(snapshot("query"), "example.com");
  assert.equal(ranking.rankingPosition, 6);
  assert.equal(ranking.rankingUrl, "https://blog.example.com/ranking-page");
  assert.equal(domainMatchesSubmission("www.example.com", "example.com"), true);
  assert.equal(domainMatchesSubmission("notexample.com", "example.com"), false);
});
