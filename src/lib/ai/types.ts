import type { OpportunityReport, Priority, Severity } from "../reports/types.ts";
import type { OpportunityScoringResult } from "../scoring/types.ts";

export interface WebsiteEvidenceItem {
  evidence: string;
  h1Present: boolean;
  id: string;
  pageType: string;
  structuredDataPresent: boolean;
  titlePresent: boolean;
  wordCount: number | null;
}

export interface SerpEvidenceItem {
  competitorFrequency: number;
  evidence: string;
  features: string[];
  id: string;
  intent: string;
  keyword: string;
  paidCompetitionSignal: number | null;
  rankingPosition: number | null;
  searchVolume: number | null;
}

export interface CompetitorEvidenceItem {
  domain: string;
  evidence: string;
  gap: string;
  id: string;
  positioning: string;
  strengths: string[];
  type: string;
}

export interface SynthesisEvidencePacket {
  business: {
    businessName: string;
    industry: string;
    location: string;
    mainGoal: string;
    primaryService: string;
    websiteUrl: string;
  };
  competitors: CompetitorEvidenceItem[];
  score: Pick<
    OpportunityScoringResult,
    "components" | "formulaVersion" | "overallScore" | "weights"
  >;
  serp: SerpEvidenceItem[];
  website: WebsiteEvidenceItem[];
}

export interface SynthesisSource {
  businessName: string;
  competitors: Array<{
    domain: string;
    evidence: unknown;
    gap: unknown;
    occurrenceCount: number;
    positioning: string | null;
    strengths: unknown;
    type: string;
  }>;
  industry: string;
  keywords: Array<{
    cpc: number | null;
    competitorFrequency: number;
    evidence: unknown;
    intent: string | null;
    keyword: string;
    monthlyTrend: Array<{ month: string; volume: number }> | null;
    paidCompetitionSignal: number | null;
    rankingPosition: number | null;
    searchVolume: number | null;
  }>;
  location: string;
  mainGoal: string;
  pages: Array<{
    h1: string | null;
    h2s: string[];
    pageType: string | null;
    structuredData: unknown;
    title: string | null;
    url: string;
    wordCount: number | null;
  }>;
  primaryService: string;
  websiteUrl: string;
}

export interface AiSynthesisOutput {
  executiveSummary: {
    businessImplication: string;
    overallAssessment: string;
  };
  nextSteps: OpportunityReport["nextSteps"];
  recommendations: Array<{
    action: string;
    effort: "low" | "medium" | "high";
    evidenceRefs: string[];
    impact: string;
    priority: Priority;
  }>;
  selectedCompetitorEvidenceIds: string[];
  selectedSerpEvidenceIds: string[];
  websiteFindings: Array<{
    evidenceId: string;
    impact: string;
    severity: Severity;
    title: string;
  }>;
}

export type SynthesizedOpportunityReport = OpportunityReport & {
  deterministicScoring: OpportunityScoringResult;
  synthesis: {
    model: string | null;
    provider: "gemini" | "deterministic";
    schemaVersion: "1.0";
  };
};
