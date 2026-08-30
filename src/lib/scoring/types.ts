export type OpportunityClassification = "existing" | "potential";
export type OpportunityPriority = "high" | "medium" | "low";

export interface ScoringPageEvidence {
  h1: string | null;
  h2s: string[];
  mainText: string | null;
  metaDescription: string | null;
  pageType: string | null;
  structuredData: unknown;
  title: string | null;
  wordCount: number | null;
}

export interface ScoringKeywordEvidence {
  cluster: string | null;
  competitorFrequency: number;
  evidence: unknown;
  intent: string | null;
  keyword: string;
  paidCompetitionSignal: number | null;
  rankingPosition: number | null;
  rankingUrl: string | null;
  searchVolume: number | null;
}

export interface ScoringCompetitorEvidence {
  evidence: unknown;
  gap: unknown;
  type: string;
}

export interface ScoredKeywordOpportunity {
  contentCoverage: number;
  findingId: string;
  intent: string;
  keyword: string;
  opportunityType: OpportunityClassification;
  priority: OpportunityPriority;
  priorityScore: number;
  rankingPosition: number | null;
  rankingUrl: string | null;
  rationale: string;
  signals: {
    businessRelevance: number;
    competitorEvidence: number;
    contentGap: number;
    demandOpportunity: number | null;
    intentValue: number;
    rankingOpportunity: number;
  };
  websiteRelevance: number;
}

export interface OpportunityScoreComponents {
  competitiveGaps: number;
  currentRankingOpportunity: number;
  keywordOpportunity: number;
  serpOpportunity: number;
  websiteReadiness: number;
}

export interface OpportunityScoringResult {
  components: OpportunityScoreComponents;
  coverage: {
    analyzedCompetitors: number;
    directCompetitors: number;
    keywordMetricsAvailable: boolean;
    keywords: number;
    serpQueriesAvailable: number;
    websitePages: number;
  };
  formulaVersion: "1.1";
  keywords: ScoredKeywordOpportunity[];
  overallScore: number;
  weights: {
    competitiveGaps: 0.15;
    currentRankingOpportunity: 0.2;
    keywordOpportunity: 0.25;
    serpOpportunity: 0.2;
    websiteReadiness: 0.2;
  };
}
