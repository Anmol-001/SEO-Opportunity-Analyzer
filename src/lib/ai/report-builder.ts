import { opportunityReportSchema } from "../reports/schema.ts";
import type { OpportunityReport, Severity } from "../reports/types.ts";
import type { OpportunityScoringResult } from "../scoring/types.ts";
import { assertEvidencePolicy } from "./evidence-policy.ts";
import type {
  AiSynthesisOutput,
  CompetitorEvidenceItem,
  SerpEvidenceItem,
  SynthesizedOpportunityReport,
  SynthesisEvidencePacket,
  SynthesisSource,
  WebsiteEvidenceItem,
} from "./types.ts";

function keywordOpportunities(
  source: SynthesisSource,
  scoring: OpportunityScoringResult,
) {
  const scored = new Map(scoring.keywords.map((keyword) => [keyword.keyword, keyword]));
  return [...source.keywords]
    .sort((a, b) => a.keyword.localeCompare(b.keyword))
    .flatMap((keyword) => {
      const score = scored.get(keyword.keyword);
      return score
        ? [
            {
              keyword: keyword.keyword,
              searchVolume: keyword.searchVolume,
              paidCompetitionSignal: keyword.paidCompetitionSignal,
              rankingPosition: keyword.rankingPosition,
              opportunityType: score.opportunityType,
              priority: score.priority,
              rationale: score.rationale,
            },
          ]
        : [];
    });
}

function websiteFinding(
  evidence: WebsiteEvidenceItem,
  interpretation: { impact: string; severity: Severity; title: string },
) {
  return {
    id: evidence.id,
    title: interpretation.title,
    severity: interpretation.severity,
    evidence: evidence.evidence,
    impact: interpretation.impact,
  };
}

function serpFinding(evidence: SerpEvidenceItem) {
  return {
    id: evidence.id,
    keyword: evidence.keyword,
    intent: evidence.intent,
    serpCharacteristics: evidence.features,
    rankingPosition: evidence.rankingPosition,
    evidence: evidence.evidence,
  };
}

function competitorFinding(evidence: CompetitorEvidenceItem) {
  return {
    id: evidence.id,
    domain: evidence.domain,
    type: evidence.type,
    positioning: evidence.positioning,
    strengths: evidence.strengths,
    gap: evidence.gap,
    evidence: evidence.evidence,
  };
}

function dataAvailability(
  source: SynthesisSource,
  scoring: OpportunityScoringResult,
  aiSynthesis: boolean,
  synthesisNote: string,
) {
  const metrics = source.keywords.some(
    (keyword) =>
      keyword.searchVolume !== null || keyword.paidCompetitionSignal !== null,
  );
  return {
    website: scoring.coverage.websitePages > 0,
    serp: scoring.coverage.serpQueriesAvailable > 0,
    keywordMetrics: metrics,
    aiSynthesis,
    notes: [
      "Rankings, keyword classifications, opportunity score, and finding evidence are copied from persisted or deterministic sources.",
      metrics
        ? "Connected keyword metrics are reported as provider data; paid competition is not SEO difficulty."
        : "Search volume, CPC, and paid competition are unavailable from the connected provider and remain unset.",
      synthesisNote,
    ],
  };
}

function finalizeReport(
  report: SynthesizedOpportunityReport,
): SynthesizedOpportunityReport {
  return opportunityReportSchema.parse(report) as unknown as SynthesizedOpportunityReport;
}

export function buildAiOpportunityReport(input: {
  model: string;
  output: AiSynthesisOutput;
  packet: SynthesisEvidencePacket;
  scoring: OpportunityScoringResult;
  source: SynthesisSource;
}) {
  assertEvidencePolicy(input.output, input.packet);
  const websiteById = new Map(input.packet.website.map((item) => [item.id, item]));
  const serpById = new Map(input.packet.serp.map((item) => [item.id, item]));
  const competitorById = new Map(
    input.packet.competitors.map((item) => [item.id, item]),
  );
  const report: SynthesizedOpportunityReport = {
    executiveSummary: input.output.executiveSummary,
    websiteFindings: input.output.websiteFindings.flatMap((finding) => {
      const evidence = websiteById.get(finding.evidenceId);
      return evidence ? [websiteFinding(evidence, finding)] : [];
    }),
    serpFindings: input.output.selectedSerpEvidenceIds.flatMap((id) => {
      const evidence = serpById.get(id);
      return evidence ? [serpFinding(evidence)] : [];
    }),
    competitorFindings: input.output.selectedCompetitorEvidenceIds.flatMap((id) => {
      const evidence = competitorById.get(id);
      return evidence ? [competitorFinding(evidence)] : [];
    }),
    keywordOpportunities: keywordOpportunities(input.source, input.scoring),
    recommendations: input.output.recommendations.map((recommendation, index) => ({
      id: `R${String(index + 1).padStart(3, "0")}`,
      ...recommendation,
    })),
    nextSteps: input.output.nextSteps,
    dataAvailability: dataAvailability(
      input.source,
      input.scoring,
      true,
      `Gemini ${input.model} synthesized interpretations and recommendations from the bounded evidence packet; factual evidence text remains code-controlled.`,
    ),
    deterministicScoring: input.scoring,
    synthesis: {
      model: input.model,
      provider: "gemini",
      schemaVersion: "1.0",
    },
  };
  return finalizeReport(report);
}

function fallbackWebsiteInterpretation(item: WebsiteEvidenceItem) {
  if (!item.titlePresent || !item.h1Present) {
    return {
      title: "Core page metadata or heading is incomplete",
      severity: "high" as const,
      impact:
        "Missing primary page signals can make the page topic less explicit to search engines and visitors.",
    };
  }
  if (item.wordCount !== null && item.wordCount < 300) {
    return {
      title: "The analyzed page has limited content depth",
      severity: "medium" as const,
      impact:
        "Limited page depth leaves less room to answer decision-stage questions and demonstrate service relevance.",
    };
  }
  if (!item.structuredDataPresent) {
    return {
      title: "No structured data was detected on the analyzed page",
      severity: "medium" as const,
      impact:
        "Relevant structured data may help search engines interpret eligible page entities and content more clearly.",
    };
  }
  return {
    title: "The analyzed page provides a usable content foundation",
    severity: "low" as const,
    impact:
      "Existing page signals provide a base that can be refined around the highest-priority search opportunities.",
  };
}

function fallbackSerpSelection(
  packet: SynthesisEvidencePacket,
  scoring: OpportunityScoringResult,
) {
  const priorities = new Map(
    scoring.keywords.map((keyword) => [keyword.keyword, keyword.priorityScore]),
  );
  return [...packet.serp]
    .sort(
      (a, b) =>
        (priorities.get(b.keyword) ?? 0) - (priorities.get(a.keyword) ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 4);
}

function fallbackRecommendations(input: {
  competitors: CompetitorEvidenceItem[];
  scoring: OpportunityScoringResult;
  serp: SerpEvidenceItem[];
  website: WebsiteEvidenceItem[];
}): OpportunityReport["recommendations"] {
  const serpByKeyword = new Map(input.serp.map((item) => [item.keyword, item]));
  const supportingId = input.website[0]?.id ?? input.competitors[0]?.id;
  const recommendations: OpportunityReport["recommendations"] = [...input.scoring.keywords]
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore || a.keyword.localeCompare(b.keyword),
    )
    .slice(0, 3)
    .flatMap((keyword, index) => {
      const serp = serpByKeyword.get(keyword.keyword);
      if (!serp) return [];
      const evidenceRefs = [serp.id, supportingId].filter(
        (value, valueIndex, values): value is string =>
          Boolean(value) && values.indexOf(value) === valueIndex,
      );
      return [
        {
          id: `R${String(index + 1).padStart(3, "0")}`,
          action:
            keyword.opportunityType === "existing"
              ? `Improve the page already associated with “${keyword.keyword}” around the observed intent and content gaps.`
              : `Create or expand a focused page for “${keyword.keyword}” using the observed intent and competitor pattern.`,
          priority: keyword.priority,
          impact:
            keyword.opportunityType === "existing"
              ? "Builds on visibility already observed in the collected search results."
              : "Addresses a relevant query for which the submitted domain was not found in the collected results.",
          effort: keyword.opportunityType === "existing" ? "medium" : "high",
          evidenceRefs,
        },
      ];
    });
  if (recommendations.length > 0) return recommendations;
  const evidenceId = supportingId;
  return evidenceId
    ? [
        {
          id: "R001",
          action:
            "Improve the analyzed page foundation, then repeat the bounded search assessment when more evidence is available.",
          priority: "medium",
          impact:
            "Addresses the available website evidence while avoiding conclusions unsupported by missing search data.",
          effort: "medium",
          evidenceRefs: [evidenceId],
        },
      ]
    : [];
}

export function buildDeterministicOpportunityReport(input: {
  packet: SynthesisEvidencePacket;
  reason: "missing_key" | "provider_failure" | "insufficient_evidence";
  scoring: OpportunityScoringResult;
  source: SynthesisSource;
}) {
  const website = input.packet.website.slice(0, 3);
  const serp = fallbackSerpSelection(input.packet, input.scoring);
  const competitors = input.packet.competitors.slice(0, 3);
  const recommendations = fallbackRecommendations({
    competitors,
    scoring: input.scoring,
    serp,
    website,
  });
  const firstActions = recommendations.map((item) => item.action);
  const evidenceSummary = [
    `${input.packet.website.length} website page${input.packet.website.length === 1 ? "" : "s"}`,
    `${input.packet.serp.length} search quer${input.packet.serp.length === 1 ? "y" : "ies"}`,
    `${input.packet.competitors.length} direct competitor${input.packet.competitors.length === 1 ? "" : "s"}`,
  ].join(", ");
  const reasonNote =
    input.reason === "missing_key"
      ? "Gemini synthesis was skipped because GEMINI_API_KEY is not configured; a deterministic evidence-based fallback was used."
      : input.reason === "provider_failure"
        ? "Gemini synthesis was unavailable or did not pass validation; a deterministic evidence-based fallback was used."
        : "There was not enough collected evidence for AI synthesis; a conservative deterministic fallback was used.";
  const report: SynthesizedOpportunityReport = {
    executiveSummary: {
      overallAssessment: `${input.source.businessName} has an SEO Opportunity Score of ${input.scoring.overallScore}/100 based on ${evidenceSummary}.`,
      businessImplication:
        recommendations[0]?.impact ??
        "Evidence coverage is currently too limited for specific growth conclusions; improve data coverage before prioritizing expansion work.",
    },
    websiteFindings: website.map((item) =>
      websiteFinding(item, fallbackWebsiteInterpretation(item)),
    ),
    serpFindings: serp.map(serpFinding),
    competitorFindings: competitors.map(competitorFinding),
    keywordOpportunities: keywordOpportunities(input.source, input.scoring),
    recommendations,
    nextSteps: {
      days30: firstActions.slice(0, 2).length
        ? firstActions.slice(0, 2)
        : ["Resolve missing website and search evidence, then rerun the assessment."],
      days60: firstActions.slice(2, 4).length
        ? firstActions.slice(2, 4)
        : ["Review page coverage against the highest-priority collected queries."],
      days90: [
        "Repeat the same bounded query sample and compare observed rankings and competitor patterns.",
      ],
    },
    dataAvailability: dataAvailability(
      input.source,
      input.scoring,
      false,
      reasonNote,
    ),
    deterministicScoring: input.scoring,
    synthesis: {
      model: null,
      provider: "deterministic",
      schemaVersion: "1.0",
    },
  };
  return finalizeReport(report);
}
