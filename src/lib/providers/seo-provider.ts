export interface OrganicResult {
  position: number;
  url: string;
  domain: string;
  title: string;
  snippet: string | null;
}

export interface SerpSnapshot {
  keyword: string;
  location: string;
  organicResults: OrganicResult[];
  features: string[];
  relatedSearches: string[];
  providerReference: string | null;
}

export interface KeywordMetric {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  paidCompetitionSignal: number | null;
  monthlyTrend: Array<{ month: string; volume: number }> | null;
}

export interface SearchLocation {
  id: string;
  name: string;
  countryCode: string;
}

export interface SeoProvider {
  readonly name: "dataforseo" | "serper";
  getSerp(input: { keyword: string; location: SearchLocation }): Promise<SerpSnapshot>;
  getKeywordMetrics(input: {
    keywords: string[];
    location: SearchLocation;
  }): Promise<KeywordMetric[]>;
  getLocations(query: string): Promise<SearchLocation[]>;
}

export class KeywordMetricsUnavailableError extends Error {
  constructor(providerName: string) {
    super(`Search-volume data unavailable from ${providerName}.`);
    this.name = "KeywordMetricsUnavailableError";
  }
}
