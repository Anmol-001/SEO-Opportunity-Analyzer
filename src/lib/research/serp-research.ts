import type {
  SearchLocation,
  SeoProvider,
  SerpSnapshot,
} from "../providers/seo-provider.ts";
import type { DiscoveredQuery } from "./query-discovery.ts";

export interface ResearchedQuery {
  query: DiscoveredQuery;
  snapshot: SerpSnapshot | null;
  warning: string | null;
}

export interface SearchLandscapeResult {
  location: SearchLocation;
  queries: ResearchedQuery[];
  warnings: string[];
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : "Search provider request failed.";
}

export function domainMatchesSubmission(candidate: string, submittedDomain: string) {
  const normalizedCandidate = candidate.toLowerCase().replace(/^www\./, "");
  const normalizedSubmitted = submittedDomain.toLowerCase().replace(/^www\./, "");
  return (
    normalizedCandidate === normalizedSubmitted ||
    normalizedCandidate.endsWith(`.${normalizedSubmitted}`)
  );
}

export function findSubmittedDomainRanking(
  snapshot: SerpSnapshot,
  submittedDomain: string,
) {
  const match = snapshot.organicResults
    .filter((result) => domainMatchesSubmission(result.domain, submittedDomain))
    .sort((a, b) => a.position - b.position)[0];
  return {
    rankingPosition: match?.position ?? null,
    rankingUrl: match?.url ?? null,
  };
}

export async function researchSearchLandscape(
  input: {
    location: string;
    queries: DiscoveredQuery[];
  },
  provider: SeoProvider,
  concurrency = 2,
): Promise<SearchLandscapeResult> {
  const locations = await provider.getLocations(input.location);
  const location = locations[0];
  if (!location) throw new Error(`No search location found for ${input.location}.`);

  const results: ResearchedQuery[] = new Array(input.queries.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, input.queries.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < input.queries.length) {
      const index = nextIndex++;
      const query = input.queries[index];
      try {
        const snapshot = await provider.getSerp({ keyword: query.keyword, location });
        results[index] = { query, snapshot, warning: null };
      } catch (error) {
        const warning = `SERP unavailable for "${query.keyword}": ${safeMessage(error)}`.slice(
          0,
          500,
        );
        results[index] = { query, snapshot: null, warning };
      }
    }
  });
  await Promise.all(workers);

  return {
    location,
    queries: results,
    warnings: results.flatMap((result) => (result.warning ? [result.warning] : [])),
  };
}
