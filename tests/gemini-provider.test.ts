import assert from "node:assert/strict";
import test from "node:test";

import { GeminiProvider } from "../src/lib/ai/gemini.ts";
import type {
  AiSynthesisOutput,
  SynthesisEvidencePacket,
} from "../src/lib/ai/types.ts";

const packet: SynthesisEvidencePacket = {
  business: {
    businessName: "Acme Search",
    industry: "SEO software",
    location: "Delhi, India",
    mainGoal: "Generate qualified product enquiries",
    primaryService: "SEO opportunity analysis",
    websiteUrl: "https://example.com",
  },
  website: [
    {
      evidence: "homepage “Example”; H1 “Example”; 200 words; structured data not detected",
      h1Present: true,
      id: "W001",
      pageType: "homepage",
      structuredDataPresent: false,
      titlePresent: true,
      wordCount: 200,
    },
  ],
  serp: [
    {
      competitorFrequency: 3,
      evidence: "Query observed; submitted domain not found in collected results",
      features: ["people_also_ask"],
      id: "S001",
      intent: "commercial",
      keyword: "seo opportunity tool",
      paidCompetitionSignal: null,
      rankingPosition: null,
      searchVolume: null,
    },
  ],
  competitors: [
    {
      domain: "competitor.example",
      evidence: "competitor.example appeared across 3 query result sets",
      gap: "Competitor uses FAQ coverage.",
      id: "C001",
      positioning: "SEO analyzer",
      strengths: ["FAQ coverage"],
      type: "direct",
    },
  ],
  score: {
    components: {
      competitiveGaps: 60,
      currentRankingOpportunity: 65,
      keywordOpportunity: 75,
      serpOpportunity: 55,
      websiteReadiness: 40,
    },
    formulaVersion: "1.1",
    overallScore: 60,
    weights: {
      competitiveGaps: 0.15,
      currentRankingOpportunity: 0.2,
      keywordOpportunity: 0.25,
      serpOpportunity: 0.2,
      websiteReadiness: 0.2,
    },
  },
};

const output: AiSynthesisOutput = {
  executiveSummary: {
    overallAssessment: "The collected evidence shows a relevant search opportunity.",
    businessImplication: "Prioritize focused coverage before expanding the query set.",
  },
  websiteFindings: [
    {
      evidenceId: "W001",
      title: "The homepage has limited depth",
      severity: "medium",
      impact: "The page has limited space to address decision-stage questions.",
    },
  ],
  selectedSerpEvidenceIds: ["S001"],
  selectedCompetitorEvidenceIds: ["C001"],
  recommendations: [
    {
      action: "Expand the service page around the observed commercial query.",
      priority: "high",
      impact: "Addresses the documented coverage and visibility gap.",
      effort: "medium",
      evidenceRefs: ["W001", "S001"],
    },
  ],
  nextSteps: {
    days30: ["Expand the primary service page."],
    days60: ["Add evidence-backed supporting content."],
    days90: ["Repeat the same query sample."],
  },
};

test("requests schema-constrained Gemini output without exposing the key in the URL", async () => {
  let requestedUrl = "";
  let requestBody: Record<string, unknown> | null = null;
  let apiKeyHeader: string | null = null;
  const provider = new GeminiProvider("secret-test-key", "gemini-3.5-flash", {
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      apiKeyHeader = new Headers(init?.headers).get("x-goog-api-key");
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.deepEqual(await provider.synthesize(packet), output);
  assert.equal(apiKeyHeader, "secret-test-key");
  assert.equal(requestedUrl.includes("secret-test-key"), false);
  assert.match(requestedUrl, /gemini-3\.5-flash:generateContent$/);
  const capturedBody = requestBody as unknown as Record<string, unknown>;
  const generationConfig = capturedBody.generationConfig as
    | Record<string, unknown>
    | undefined;
  assert.equal(generationConfig?.responseMimeType, "application/json");
  assert.equal(typeof generationConfig?.responseJsonSchema, "object");
});

test("rejects malformed Gemini output and sanitizes provider failures", async () => {
  const malformed = new GeminiProvider("test-key", "gemini-3.5-flash", {
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{\"unexpected\":true}" }] } }],
        }),
        { status: 200 },
      ),
  });
  await assert.rejects(
    malformed.synthesize(packet),
    /did not match the report schema/,
  );

  const failed = new GeminiProvider("test-key", "gemini-3.5-flash", {
    fetchImpl: async () =>
      new Response('{"message":"private provider detail"}', { status: 429 }),
  });
  await assert.rejects(failed.synthesize(packet), /failed with status 429/);
});
