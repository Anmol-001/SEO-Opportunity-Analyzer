export type PageType =
  | "homepage"
  | "service"
  | "location"
  | "service-location"
  | "relevant";

export interface InternalLink {
  text: string;
  url: string;
}

export interface RobotsRule {
  directive: "allow" | "disallow";
  path: string;
}

export interface RobotsPolicy {
  fetched: boolean;
  finalUrl: string | null;
  rules: RobotsRule[];
  sitemaps: string[];
  status: number | null;
}

export interface SelectedPage {
  pageType: PageType;
  reason: string;
  score: number;
  url: string;
}

export interface AnalyzedPage {
  canonicalUrl: string | null;
  h1: string | null;
  h2s: string[];
  imageAlts: string[];
  internalLinks: InternalLink[];
  mainText: string;
  metaDescription: string | null;
  pageType: PageType;
  robotsDirectives: string[];
  structuredData: unknown[];
  title: string | null;
  url: string;
  wordCount: number;
}

export interface WebsiteScanResult {
  homepageUrl: string;
  pages: AnalyzedPage[];
  robots: RobotsPolicy;
  sitemapUrl: string | null;
  warnings: string[];
}
