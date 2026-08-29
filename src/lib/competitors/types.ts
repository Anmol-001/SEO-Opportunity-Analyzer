export type CompetitorCategory =
  | "direct"
  | "directory"
  | "publisher"
  | "platform"
  | "other";

export interface OrganicSerpEvidence {
  domain: string;
  keyword: string;
  position: number;
  snippet: string | null;
  title: string | null;
  url: string;
}

export interface DiscoveredCompetitor {
  bestPosition: number;
  domain: string;
  matchedTerms: string[];
  occurrenceCount: number;
  queries: string[];
  rankingUrls: string[];
  relevanceScore: number;
  selectionScore: number;
  type: CompetitorCategory;
}

export interface CompetitorPageSignals {
  canonicalUrl: string | null;
  ctaSignals: string[];
  faqPresent: boolean;
  h1: string | null;
  h2s: string[];
  locationMention: boolean;
  metaDescription: string | null;
  robotsDirectives: string[];
  serviceTermsMatched: string[];
  structuredDataTypes: string[];
  title: string | null;
  url: string;
  wordCount: number;
}

export interface AnalyzedCompetitor {
  candidate: DiscoveredCompetitor;
  page: CompetitorPageSignals | null;
  warning: string | null;
}

export interface SubmittedSiteBaseline {
  faqPresent: boolean;
  locationMention: boolean;
  maxWordCount: number;
  serviceTermsMatched: string[];
  structuredDataTypes: string[];
}
