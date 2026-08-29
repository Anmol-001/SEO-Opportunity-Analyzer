import assert from "node:assert/strict";
import test from "node:test";

import { buildSynthesisEvidencePacket } from "../src/lib/ai/evidence-packet.ts";
import { EvidencePolicyError } from "../src/lib/ai/evidence-policy.ts";
import {
  buildAiOpportunityReport,
  buildDeterministicOpportunityReport,
} from "../src/lib/ai/report-builder.ts";
import type {
  AiSynthesisOutput,
  SynthesisSource,
} from "../src/lib/ai/types.ts";
import { scoreSeoOpportunity } from "../src/lib/scoring/opportunity-engine.ts";

const source: SynthesisSource = {
  businessName: "Acme Search",
  competitors: [
    {
      domain: "competitor.example",
      evidence: {
        discovery: { bestPosition: 2 },
        page: { url: "https://competitor.example/tool" },
      },
      gap: ["Competitor uses FAQ coverage."],
      occurrenceCount: 3,
      positioning: "Competitor SEO analyzer",
      strengths: ["FAQ coverage"],
      type: "direct",
    },
  ],
  industry: "SEO software",
  keywords: [
    {
      competitorFrequency: 3,
      evidence: { status: "available", serpFeatures: ["people_also_ask"] },
      intent: "commercial",
      keyword: "seo opportunity tool",
      paidCompetitionSignal: null,
      rankingPosition: null,
      searchVolume: null,
    },
  ],
  location: "Delhi, India",
  mainGoal: "Generate qualified product enquiries",
  pages: [
    {
      h1: "SEO opportunity analysis",
      h2s: ["Analyze search gaps"],
      pageType: "homepage",
      structuredData: [],
      title: "Acme Search",
      url: "https://example.com",
      wordCount: 220,
    },
  ],
  primaryService: "SEO opportunity analysis",
  websiteUrl: "https://example.com",
};

const scoring = scoreSeoOpportunity({
  competitors: source.competitors,
  industry: source.industry,
  keywords: source.keywords.map((keyword) => ({
    cluster: "core",
    competitorFrequency: keyword.competitorFrequency,
    evidence: keyword.evidence,
    intent: keyword.intent,
    keyword: keyword.keyword,
    rankingPosition: keyword.rankingPosition,
    rankingUrl: null,
  })),
  location: source.location,
  pages: source.pages.map((page) => ({
    h1: page.h1,
    h2s: page.h2s,
    mainText: "SEO opportunity analysis for product teams.",
    metaDescription: "Analyze SEO opportunities.",
    pageType: page.pageType,
    structuredData: page.structuredData,
    title: page.title,
    wordCount: page.wordCount,
  })),
  primaryService: source.primaryService,
});
const packet = buildSynthesisEvidencePacket(source, scoring);

const validOutput: AiSynthesisOutput = {
  executiveSummary: {
    overallAssessment: "The evidence shows a relevant but under-covered query.",
    businessImplication: "Focused page work is the clearest current priority.",
  },
  websiteFindings: [
    {
      evidenceId: "W001",
      title: "The homepage has limited depth",
      severity: "medium",
      impact: "The page has limited space for decision-stage detail.",
    },
  ],
  selectedSerpEvidenceIds: ["S001"],
  selectedCompetitorEvidenceIds: ["C001"],
  recommendations: [
    {
      action: "Expand the service page around the collected commercial query.",
      priority: "high",
      impact: "Addresses the observed content and visibility gap.",
      effort: "medium",
      evidenceRefs: ["W001", "S001"],
    },
  ],
  nextSteps: {
    days30: ["Expand the service page."],
    days60: ["Add supporting decision-stage content."],
    days90: ["Repeat the same search sample."],
  },
};

test("keeps factual finding evidence code-controlled in an AI report", () => {
  const report = buildAiOpportunityReport({
    model: "gemini-3.5-flash",
    output: validOutput,
    packet,
    scoring,
    source,
  });

  assert.equal(report.dataAvailability.aiSynthesis, true);
  assert.equal(report.synthesis.provider, "gemini");
  assert.equal(report.serpFindings[0].evidence, packet.serp[0].evidence);
  assert.equal(report.competitorFindings[0].domain, "competitor.example");
  assert.equal(report.keywordOpportunities[0].searchVolume, null);
  assert.deepEqual(report.recommendations[0].evidenceRefs, ["W001", "S001"]);
});

test("rejects unknown evidence references and unsupported forecasts", () => {
  assert.throws(
    () =>
      buildAiOpportunityReport({
        model: "gemini-3.5-flash",
        output: {
          ...validOutput,
          recommendations: [
            { ...validOutput.recommendations[0], evidenceRefs: ["C999"] },
          ],
        },
        packet,
        scoring,
        source,
      }),
    EvidencePolicyError,
  );
  assert.throws(
    () =>
      buildAiOpportunityReport({
        model: "gemini-3.5-flash",
        output: {
          ...validOutput,
          executiveSummary: {
            ...validOutput.executiveSummary,
            businessImplication: "This will increase traffic by 40%.",
          },
        },
        packet,
        scoring,
        source,
      }),
    EvidencePolicyError,
  );
});

test("builds a business-specific deterministic fallback when Gemini is unavailable", () => {
  const report = buildDeterministicOpportunityReport({
    packet,
    reason: "missing_key",
    scoring,
    source,
  });

  assert.match(report.executiveSummary.overallAssessment, /Acme Search/);
  assert.equal(report.executiveSummary.overallAssessment.includes("Northstar"), false);
  assert.equal(report.dataAvailability.aiSynthesis, false);
  assert.equal(report.synthesis.model, null);
  const validFindingIds = new Set([
    ...report.websiteFindings.map((item) => item.id),
    ...report.serpFindings.map((item) => item.id),
    ...report.competitorFindings.map((item) => item.id),
  ]);
  assert.ok(
    report.recommendations.every((recommendation) =>
      recommendation.evidenceRefs.every((id) => validFindingIds.has(id)),
    ),
  );
});
