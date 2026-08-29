import { demoReport } from "../reports/fixture.ts";
import type { OpportunityReport } from "../reports/types.ts";
import type { OpportunityScoringResult } from "./types.ts";

export type ScoredFixtureReport = OpportunityReport & {
  deterministicScoring: OpportunityScoringResult;
};

export function buildScoredFixtureReport(
  scoring: OpportunityScoringResult,
): ScoredFixtureReport {
  return {
    ...demoReport,
    keywordOpportunities: scoring.keywords.map((keyword) => ({
      keyword: keyword.keyword,
      searchVolume: null,
      paidCompetitionSignal: null,
      rankingPosition: keyword.rankingPosition,
      opportunityType: keyword.opportunityType,
      priority: keyword.priority,
      rationale: keyword.rationale,
    })),
    dataAvailability: {
      website: scoring.coverage.websitePages > 0,
      serp: scoring.coverage.serpQueriesAvailable > 0,
      keywordMetrics: false,
      aiSynthesis: false,
      notes: [
        "The opportunity score and keyword table use persisted website, SERP, ranking, and competitor evidence.",
        "Search volume, CPC, and paid competition are unavailable from Serper and remain unset.",
        "Narrative findings and recommendations remain representative fixture content until Gemini synthesis is connected.",
      ],
    },
    deterministicScoring: scoring,
  };
}
