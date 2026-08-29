export type QueryCluster =
  | "seed"
  | "core"
  | "commercial"
  | "pricing"
  | "informational"
  | "local";

export type SearchIntent =
  | "commercial"
  | "transactional"
  | "informational"
  | "local";

export interface DiscoveredQuery {
  keyword: string;
  cluster: QueryCluster;
  intent: SearchIntent;
}

export interface QueryDiscoveryInput {
  industry: string;
  location: string;
  mainGoal: string;
  primaryService: string;
  targetKeywords?: string[];
}

const MAX_QUERIES = 8;
const MIN_QUERIES = 5;

function normalizePhrase(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function addLocation(phrase: string, location: string) {
  const normalizedPhrase = normalizePhrase(phrase);
  const normalizedLocation = normalizePhrase(location);
  if (!normalizedLocation || normalizedPhrase.includes(normalizedLocation)) {
    return normalizedPhrase;
  }
  return `${normalizedPhrase} ${normalizedLocation}`;
}

function inferSeedIntent(keyword: string): SearchIntent {
  if (/\b(near me|nearby|local)\b/i.test(keyword)) return "local";
  if (/\b(cost|price|pricing|quote|book|buy|hire)\b/i.test(keyword)) {
    return "transactional";
  }
  if (/^(how|what|why|when|where|can|does|is)\b/i.test(keyword)) {
    return "informational";
  }
  return "commercial";
}

function candidate(
  keyword: string,
  cluster: QueryCluster,
  intent: SearchIntent,
): DiscoveredQuery {
  return { keyword: normalizePhrase(keyword), cluster, intent };
}

export function discoverQueries(input: QueryDiscoveryInput): DiscoveredQuery[] {
  const service = normalizePhrase(input.primaryService);
  const location = normalizePhrase(input.location);
  const industry = normalizePhrase(input.industry);
  const goal = normalizePhrase(input.mainGoal);
  const prioritizesCommercialIntent =
    /\b(lead|leads|sale|sales|customer|customers|booking|bookings|appointment|appointments|revenue|conversion|conversions)\b/.test(
      goal,
    );

  const seeds = (input.targetKeywords ?? []).map((keyword) =>
    candidate(keyword, "seed", inferSeedIntent(keyword)),
  );

  const commercialCandidates = [
    candidate(addLocation(service, location), "core", "commercial"),
    candidate(addLocation(`best ${service}`, location), "commercial", "commercial"),
    candidate(
      addLocation(`${service} provider`, location),
      "commercial",
      "commercial",
    ),
  ];
  const exploratoryCandidates = [
    candidate(addLocation(`${service} cost`, location), "pricing", "transactional"),
    candidate(`${service} near me`, "local", "local"),
    candidate(`how to choose ${service}`, "informational", "informational"),
    candidate(addLocation(industry, location), "core", "commercial"),
  ];
  const generated = prioritizesCommercialIntent
    ? [...commercialCandidates, ...exploratoryCandidates]
    : [
        commercialCandidates[0],
        exploratoryCandidates[0],
        exploratoryCandidates[2],
        commercialCandidates[1],
        exploratoryCandidates[1],
        commercialCandidates[2],
        exploratoryCandidates[3],
      ];

  const result: DiscoveredQuery[] = [];
  const seen = new Set<string>();
  for (const query of [...seeds, ...generated]) {
    if (!query.keyword || seen.has(query.keyword)) continue;
    seen.add(query.keyword);
    result.push(query);
    if (result.length === MAX_QUERIES) break;
  }

  if (result.length < MIN_QUERIES) {
    const fallbacks = [
      candidate(`${service} reviews`, "commercial", "commercial"),
      candidate(`${service} benefits`, "informational", "informational"),
      candidate(addLocation(`${service} services`, location), "core", "commercial"),
    ];
    for (const query of fallbacks) {
      if (seen.has(query.keyword)) continue;
      seen.add(query.keyword);
      result.push(query);
      if (result.length >= MIN_QUERIES) break;
    }
  }

  return result.slice(0, MAX_QUERIES);
}
