import assert from "node:assert/strict";
import test from "node:test";

import {
  rankingOpportunityScore,
  scoreSeoOpportunity,
} from "../src/lib/scoring/opportunity-engine.ts";
import { buildScoredFixtureReport } from "../src/lib/scoring/scored-fixture-report.ts";

const pages = [
  {
    h1: "Dental implants in Noida",
    h2s: ["Treatment options"],
    mainText: "Dental implant treatment for patients in Noida, India.",
    metaDescription: "Dental implants in Noida, India.",
    pageType: "homepage",
    structuredData: [{ "@type": "Dentist" }],
    title: "Dental implants Noida",
    wordCount: 450,
  },
  {
    h1: "Dental implant treatment",
    h2s: ["Implant procedure"],
    mainText: "A detailed dental implant procedure and consultation guide.",
    metaDescription: "Dental implant treatment",
    pageType: "service-location",
    structuredData: [],
    title: "Dental implant treatment in Noida",
    wordCount: 900,
  },
];

const keywords = [
  {
    cluster: "core",
    competitorFrequency: 4,
    evidence: {
      status: "available",
      serpFeatures: ["local_pack", "people_also_ask", "ads"],
    },
    intent: "commercial",
    keyword: "dental implants noida",
    rankingPosition: 8,
    rankingUrl: "https://client.example/implants",
  },
  {
    cluster: "pricing",
    competitorFrequency: 3,
    evidence: { status: "available", serpFeatures: ["people_also_ask"] },
    intent: "transactional",
    keyword: "dental implant cost noida",
    rankingPosition: null,
    rankingUrl: null,
  },
  {
    cluster: "informational",
    competitorFrequency: 2,
    evidence: { status: "available", serpFeatures: [] },
    intent: "informational",
    keyword: "dental implant recovery",
    rankingPosition: null,
    rankingUrl: null,
  },
];

const competitors = [
  { type: "direct", evidence: { page: { url: "one" } }, gap: ["gap one", "gap two"] },
  { type: "direct", evidence: { page: { url: "two" } }, gap: ["gap three"] },
  { type: "directory", evidence: null, gap: ["ignored"] },
];

test("calculates deterministic keyword and weighted opportunity scores", () => {
  const result = scoreSeoOpportunity({
    competitors,
    industry: "Dental care",
    keywords,
    location: "Noida, India",
    pages,
    primaryService: "Dental implants",
  });

  assert.equal(result.formulaVersion, "1.0");
  assert.equal(result.overallScore, 69);
  assert.deepEqual(result.components, {
    competitiveGaps: 65,
    currentRankingOpportunity: 75,
    keywordOpportunity: 58,
    serpOpportunity: 63,
    websiteReadiness: 88,
  });
  assert.deepEqual(
    result.keywords.map((keyword) => keyword.findingId),
    ["K001", "K002", "K003"],
  );
  const core = result.keywords.find(
    (keyword) => keyword.keyword === "dental implants noida",
  );
  const pricing = result.keywords.find(
    (keyword) => keyword.keyword === "dental implant cost noida",
  );
  assert.equal(core?.opportunityType, "existing");
  assert.equal(core?.priority, "high");
  assert.equal(core?.priorityScore, 74);
  assert.equal(pricing?.opportunityType, "potential");
  assert.equal(pricing?.priorityScore, 54);
  assert.equal(result.coverage.keywordMetricsAvailable, false);
  assert.deepEqual(
    scoreSeoOpportunity({
      competitors,
      industry: "Dental care",
      keywords,
      location: "Noida, India",
      pages,
      primaryService: "Dental implants",
    }),
    result,
  );
});

test("uses ranking bands without treating an unranked keyword as zero opportunity", () => {
  assert.equal(rankingOpportunityScore(1), 35);
  assert.equal(rankingOpportunityScore(8), 95);
  assert.equal(rankingOpportunityScore(15), 90);
  assert.equal(rankingOpportunityScore(35), 75);
  assert.equal(rankingOpportunityScore(70), 60);
  assert.equal(rankingOpportunityScore(null), 65);
});

test("maps scored keywords into the fixture report without inventing metrics", () => {
  const scoring = scoreSeoOpportunity({
    competitors,
    industry: "Dental care",
    keywords,
    location: "Noida, India",
    pages,
    primaryService: "Dental implants",
  });
  const report = buildScoredFixtureReport(scoring);

  assert.equal(report.deterministicScoring.overallScore, 69);
  assert.equal(report.dataAvailability.keywordMetrics, false);
  assert.equal(report.dataAvailability.aiSynthesis, false);
  assert.ok(
    report.keywordOpportunities.every(
      (keyword) =>
        keyword.searchVolume === null && keyword.paidCompetitionSignal === null,
    ),
  );
});
