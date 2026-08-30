import assert from "node:assert/strict";
import test from "node:test";

import {
  rankingOpportunityScore,
  scoreSeoOpportunity,
} from "../src/lib/scoring/opportunity-engine.ts";
import { buildSynthesisEvidencePacket } from "../src/lib/ai/evidence-packet.ts";
import { buildDeterministicOpportunityReport } from "../src/lib/ai/report-builder.ts";
import type { SynthesisSource } from "../src/lib/ai/types.ts";

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
    paidCompetitionSignal: null,
    rankingPosition: 8,
    rankingUrl: "https://client.example/implants",
    searchVolume: null,
  },
  {
    cluster: "pricing",
    competitorFrequency: 3,
    evidence: { status: "available", serpFeatures: ["people_also_ask"] },
    intent: "transactional",
    keyword: "dental implant cost noida",
    paidCompetitionSignal: null,
    rankingPosition: null,
    rankingUrl: null,
    searchVolume: null,
  },
  {
    cluster: "informational",
    competitorFrequency: 2,
    evidence: { status: "available", serpFeatures: [] },
    intent: "informational",
    keyword: "dental implant recovery",
    paidCompetitionSignal: null,
    rankingPosition: null,
    rankingUrl: null,
    searchVolume: null,
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

  assert.equal(result.formulaVersion, "1.1");
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

test("maps scored keywords into the deterministic fallback without inventing metrics", () => {
  const scoring = scoreSeoOpportunity({
    competitors,
    industry: "Dental care",
    keywords,
    location: "Noida, India",
    pages,
    primaryService: "Dental implants",
  });
  const source: SynthesisSource = {
    businessName: "Northstar Dental",
    competitors: competitors.map((competitor, index) => ({
      domain: `competitor-${index + 1}.example`,
      evidence: competitor.evidence,
      gap: competitor.gap,
      occurrenceCount: 4 - index,
      positioning: null,
      strengths: [],
      type: competitor.type,
    })),
    industry: "Dental care",
    keywords: keywords.map((keyword) => ({
      cpc: null,
      competitorFrequency: keyword.competitorFrequency,
      evidence: keyword.evidence,
      intent: keyword.intent,
      keyword: keyword.keyword,
      monthlyTrend: null,
      paidCompetitionSignal: null,
      rankingPosition: keyword.rankingPosition,
      searchVolume: null,
    })),
    location: "Noida, India",
    mainGoal: "Generate more qualified consultation enquiries",
    pages: pages.map((page, index) => ({
      h1: page.h1,
      h2s: page.h2s,
      pageType: page.pageType,
      structuredData: page.structuredData,
      title: page.title,
      url: `https://client.example/page-${index + 1}`,
      wordCount: page.wordCount,
    })),
    primaryService: "Dental implants",
    websiteUrl: "https://client.example",
  };
  const packet = buildSynthesisEvidencePacket(source, scoring);
  const report = buildDeterministicOpportunityReport({
    packet,
    reason: "missing_key",
    scoring,
    source,
  });

  assert.equal(report.deterministicScoring.overallScore, 69);
  assert.equal(report.dataAvailability.keywordMetrics, false);
  assert.equal(report.dataAvailability.aiSynthesis, false);
  assert.equal(report.synthesis.provider, "deterministic");
  assert.ok(
    report.keywordOpportunities.every(
      (keyword) =>
        keyword.searchVolume === null && keyword.paidCompetitionSignal === null,
    ),
  );
});

test("uses relative search demand without treating paid competition as SEO difficulty", () => {
  const withMetrics = keywords.map((keyword, index) => ({
    ...keyword,
    searchVolume: [1_000, 100, 10][index],
    paidCompetitionSignal: [0.9, 0.5, 0.1][index],
  }));
  const result = scoreSeoOpportunity({
    competitors,
    industry: "Dental care",
    keywords: withMetrics,
    location: "Noida, India",
    pages,
    primaryService: "Dental implants",
  });

  assert.equal(result.coverage.keywordMetricsAvailable, true);
  const core = result.keywords.find(
    (keyword) => keyword.keyword === "dental implants noida",
  );
  assert.equal(core?.signals.demandOpportunity, 100);
  assert.match(core?.rationale ?? "", /1,000 average monthly searches/);
  assert.match(core?.rationale ?? "", /not SEO difficulty/);
});
