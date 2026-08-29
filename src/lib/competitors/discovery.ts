import type {
  CompetitorCategory,
  DiscoveredCompetitor,
  OrganicSerpEvidence,
} from "./types.ts";

const commonMultiPartSuffixes = new Set([
  "co.in",
  "co.jp",
  "co.nz",
  "co.uk",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "com.tr",
  "com.ua",
  "net.au",
  "org.au",
  "org.uk",
]);

const platformDomains = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
]);
const directoryDomains = new Set([
  "angi.com",
  "capterra.com",
  "climatebase.org",
  "clutch.co",
  "fiverr.com",
  "g2.com",
  "glassdoor.com",
  "goodfirms.co",
  "indiamart.com",
  "indeed.com",
  "internshala.com",
  "justdial.com",
  "monster.com",
  "naukri.com",
  "practo.com",
  "sulekha.com",
  "tradeindia.com",
  "upwork.com",
  "yellowpages.com",
  "yelp.com",
]);
const publisherDomains = new Set([
  "businessinsider.com",
  "coursera.org",
  "forbes.com",
  "healthline.com",
  "hubspot.com",
  "medium.com",
  "mayoclinic.org",
  "neilpatel.com",
  "nerdwallet.com",
  "searchenginejournal.com",
  "searchengineland.com",
  "techcrunch.com",
  "webmd.com",
  "wikipedia.org",
]);
const stopWords = new Set([
  "and",
  "best",
  "business",
  "company",
  "for",
  "from",
  "near",
  "product",
  "provider",
  "service",
  "services",
  "the",
  "with",
]);

function normalizedText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function meaningfulTerms(...values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => normalizedText(value).split(" "))
        .filter((term) => term.length >= 3 && !stopWords.has(term)),
    ),
  ];
}

export function registrableDomain(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const labels = normalized.split(".").filter(Boolean);
  if (labels.length <= 2 || /^\d+(?:\.\d+){3}$/.test(normalized)) return normalized;
  const suffix = labels.slice(-2).join(".");
  return commonMultiPartSuffixes.has(suffix)
    ? labels.slice(-3).join(".")
    : labels.slice(-2).join(".");
}

function knownCategory(domain: string): CompetitorCategory | null {
  if (platformDomains.has(domain)) return "platform";
  if (directoryDomains.has(domain)) return "directory";
  if (publisherDomains.has(domain) || /\.(?:edu|gov)(?:\.[a-z]{2})?$/.test(domain)) {
    return "publisher";
  }
  return null;
}

function pageSearchText(result: OrganicSerpEvidence) {
  let pathname = "";
  try {
    pathname = decodeURIComponent(new URL(result.url).pathname);
  } catch {
    // The normalized domain and visible SERP text can still be used.
  }
  return normalizedText(
    `${result.domain} ${pathname} ${result.title ?? ""} ${result.snippet ?? ""}`,
  );
}

function classifyCompetitor(domain: string, relevanceScore: number) {
  return knownCategory(domain) ?? (relevanceScore >= 0.2 ? "direct" : "other");
}

export function discoverCompetitors(input: {
  industry: string;
  primaryService: string;
  results: OrganicSerpEvidence[];
  submittedDomain: string;
}): DiscoveredCompetitor[] {
  const submittedDomain = registrableDomain(input.submittedDomain);
  const terms = meaningfulTerms(input.primaryService, input.industry);
  const groups = new Map<
    string,
    {
      matchedTerms: Set<string>;
      queries: Set<string>;
      results: OrganicSerpEvidence[];
    }
  >();

  for (const result of input.results) {
    const domain = registrableDomain(result.domain);
    if (!domain || domain === submittedDomain || result.position < 1 || !result.url) continue;
    const group = groups.get(domain) ?? {
      matchedTerms: new Set<string>(),
      queries: new Set<string>(),
      results: [],
    };
    const searchText = pageSearchText(result);
    for (const term of terms) {
      if (searchText.includes(term)) group.matchedTerms.add(term);
    }
    group.queries.add(result.keyword);
    group.results.push(result);
    groups.set(domain, group);
  }

  return [...groups.entries()]
    .map(([domain, group]): DiscoveredCompetitor => {
      const sortedResults = [...group.results].sort((a, b) => a.position - b.position);
      const rankingUrls = [
        ...new Set(sortedResults.map((result) => result.url)),
      ].slice(0, 5);
      const bestPosition = sortedResults[0]?.position ?? 100;
      const relevanceScore =
        terms.length === 0 ? 0 : group.matchedTerms.size / terms.length;
      const type = classifyCompetitor(domain, relevanceScore);
      const typeWeight =
        type === "direct" ? 30 : type === "other" ? 5 : -30;
      const selectionScore =
        group.queries.size * 100 +
        Math.round(relevanceScore * 50) +
        Math.max(0, 11 - bestPosition) +
        typeWeight;
      return {
        bestPosition,
        domain,
        matchedTerms: [...group.matchedTerms].sort(),
        occurrenceCount: group.queries.size,
        queries: [...group.queries].sort(),
        rankingUrls,
        relevanceScore: Number(relevanceScore.toFixed(3)),
        selectionScore,
        type,
      };
    })
    .sort(
      (a, b) =>
        b.selectionScore - a.selectionScore ||
        a.bestPosition - b.bestPosition ||
        a.domain.localeCompare(b.domain),
    );
}

export function selectCompetitorsForAnalysis(
  competitors: DiscoveredCompetitor[],
  limit = 5,
) {
  return competitors
    .filter((competitor) => competitor.type === "direct")
    .slice(0, Math.max(0, Math.min(limit, 5)));
}
