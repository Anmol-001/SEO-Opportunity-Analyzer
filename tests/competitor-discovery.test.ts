import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverCompetitors,
  registrableDomain,
  selectCompetitorsForAnalysis,
} from "../src/lib/competitors/discovery.ts";
import type { OrganicSerpEvidence } from "../src/lib/competitors/types.ts";

function result(
  keyword: string,
  domain: string,
  position: number,
  title: string,
): OrganicSerpEvidence {
  return {
    domain,
    keyword,
    position,
    snippet: `${title} for dental implant patients.`,
    title,
    url: `https://${domain}/dental-implants`,
  };
}

test("aggregates recurring domains and classifies non-competitor results", () => {
  const competitors = discoverCompetitors({
    industry: "Dental care",
    primaryService: "Dental implants",
    submittedDomain: "www.client.co.in",
    results: [
      result("implants noida", "www.client.co.in", 1, "Client Dental"),
      result("implants noida", "www.northstar.com", 2, "Dental implants Noida"),
      result("implant cost", "blog.northstar.com", 3, "Dental implant pricing"),
      result("implants noida", "youtube.com", 4, "Dental implant video"),
      result("implant cost", "clutch.co", 5, "Dental agencies"),
      result("implant jobs", "indeed.com", 5, "Dental implant jobs"),
      result("implant guide", "medium.com", 6, "Dental implant guide"),
      {
        domain: "unrelated.example",
        keyword: "implant guide",
        position: 7,
        snippet: "A general business article.",
        title: "General business article",
        url: "https://unrelated.example/article",
      },
    ],
  });

  assert.equal(registrableDomain("clinic.client.co.in"), "client.co.in");
  assert.equal(competitors.some((item) => item.domain === "client.co.in"), false);
  const northstar = competitors.find((item) => item.domain === "northstar.com");
  assert.equal(northstar?.occurrenceCount, 2);
  assert.equal(northstar?.rankingUrls.length, 2);
  assert.equal(northstar?.type, "direct");
  assert.equal(competitors.find((item) => item.domain === "youtube.com")?.type, "platform");
  assert.equal(competitors.find((item) => item.domain === "clutch.co")?.type, "directory");
  assert.equal(competitors.find((item) => item.domain === "indeed.com")?.type, "directory");
  assert.equal(competitors.find((item) => item.domain === "medium.com")?.type, "publisher");
  assert.equal(competitors.find((item) => item.domain === "unrelated.example")?.type, "other");
  assert.deepEqual(selectCompetitorsForAnalysis(competitors).map((item) => item.domain), [
    "northstar.com",
  ]);
});
