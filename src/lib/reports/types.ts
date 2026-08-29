export type Severity = "high" | "medium" | "low";
export type Priority = "high" | "medium" | "low";

export interface OpportunityReport {
  executiveSummary: {
    overallAssessment: string;
    businessImplication: string;
  };
  websiteFindings: Array<{
    id: string;
    title: string;
    severity: Severity;
    evidence: string;
    impact: string;
  }>;
  serpFindings: Array<{
    id: string;
    keyword: string;
    intent: string;
    serpCharacteristics: string[];
    rankingPosition: number | null;
    evidence: string;
  }>;
  competitorFindings: Array<{
    id: string;
    domain: string;
    type: string;
    positioning: string;
    strengths: string[];
    gap: string;
    evidence: string;
  }>;
  keywordOpportunities: Array<{
    keyword: string;
    searchVolume: number | null;
    paidCompetitionSignal: number | null;
    rankingPosition: number | null;
    opportunityType: "existing" | "potential";
    priority: Priority;
    rationale: string;
  }>;
  recommendations: Array<{
    id: string;
    action: string;
    priority: Priority;
    impact: string;
    effort: "low" | "medium" | "high";
    evidenceRefs: string[];
  }>;
  nextSteps: {
    days30: string[];
    days60: string[];
    days90: string[];
  };
  dataAvailability: {
    website: boolean;
    serp: boolean;
    keywordMetrics: boolean;
    aiSynthesis: boolean;
    notes: string[];
  };
}
