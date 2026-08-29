import {
  KeywordMetricsUnavailableError,
  type KeywordMetric,
  type OrganicResult,
  type SearchLocation,
  type SeoProvider,
  type SerpSnapshot,
} from "./seo-provider.ts";

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface SerperOrganicResult {
  link?: unknown;
  position?: unknown;
  snippet?: unknown;
  title?: unknown;
}

interface SerperRelatedSearch {
  query?: unknown;
}

interface SerperResponse {
  ads?: unknown;
  answerBox?: unknown;
  images?: unknown;
  knowledgeGraph?: unknown;
  news?: unknown;
  organic?: SerperOrganicResult[];
  peopleAlsoAsk?: unknown;
  places?: unknown;
  relatedSearches?: Array<SerperRelatedSearch | string>;
  shopping?: unknown;
  videos?: unknown;
}

const SERPER_SEARCH_ENDPOINT = "https://google.serper.dev/search";
const MAX_RESPONSE_BYTES = 2_000_000;

export class SerperProviderError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "SerperProviderError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasContent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return isRecord(value) && Object.keys(value).length > 0;
}

function normalizeResultDomain(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function inferCountryCode(location: string) {
  const normalized = location.toLowerCase();
  const countries: Array<[RegExp, string]> = [
    [/\b(india|bharat)\b/, "in"],
    [/\b(united states|usa|u\.s\.a\.?|u\.s\.?)\b/, "us"],
    [/\b(united kingdom|uk|u\.k\.|england|scotland|wales)\b/, "gb"],
    [/\b(canada)\b/, "ca"],
    [/\b(australia)\b/, "au"],
    [/\b(new zealand)\b/, "nz"],
    [/\b(singapore)\b/, "sg"],
    [/\b(united arab emirates|uae|u\.a\.e\.)\b/, "ae"],
    [/\b(germany)\b/, "de"],
    [/\b(france)\b/, "fr"],
    [/\b(spain)\b/, "es"],
    [/\b(italy)\b/, "it"],
  ];
  return countries.find(([pattern]) => pattern.test(normalized))?.[1] ?? "";
}

export function buildSerperLocation(query: string): SearchLocation {
  const name = query.trim().replace(/\s+/g, " ");
  if (!name) throw new SerperProviderError("A search location is required.");
  return {
    id: `serper:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    name,
    countryCode: inferCountryCode(name),
  };
}

export function parseSerperResponse(
  payload: unknown,
  keyword: string,
  location: SearchLocation,
): SerpSnapshot {
  if (!isRecord(payload)) {
    throw new SerperProviderError("Serper returned an invalid response.");
  }
  const response = payload as SerperResponse;
  const organicResults: OrganicResult[] = [];

  for (const item of Array.isArray(response.organic) ? response.organic : []) {
    if (
      typeof item.link !== "string" ||
      typeof item.title !== "string" ||
      typeof item.position !== "number"
    ) {
      continue;
    }
    const domain = normalizeResultDomain(item.link);
    if (!domain || item.position < 1) continue;
    organicResults.push({
      position: Math.trunc(item.position),
      url: item.link,
      domain,
      title: item.title,
      snippet: typeof item.snippet === "string" ? item.snippet : null,
    });
  }

  const featureMap: Array<[keyof SerperResponse, string]> = [
    ["ads", "ads"],
    ["answerBox", "featured_answer"],
    ["images", "images"],
    ["knowledgeGraph", "knowledge_graph"],
    ["news", "news"],
    ["peopleAlsoAsk", "people_also_ask"],
    ["places", "local_pack"],
    ["shopping", "shopping"],
    ["videos", "videos"],
  ];
  const features = featureMap
    .filter(([key]) => hasContent(response[key]))
    .map(([, label]) => label);

  const relatedSearches = (Array.isArray(response.relatedSearches)
    ? response.relatedSearches
    : []
  )
    .map((item) =>
      typeof item === "string"
        ? item
        : typeof item?.query === "string"
          ? item.query
          : null,
    )
    .filter((item): item is string => Boolean(item));

  return {
    keyword,
    location: location.name,
    organicResults: organicResults.sort((a, b) => a.position - b.position),
    features,
    relatedSearches,
    providerReference: null,
  };
}

export interface SerperProviderOptions {
  endpoint?: string;
  fetchImpl?: ProviderFetch;
  timeoutMs?: number;
}

export class SerperProvider implements SeoProvider {
  readonly name = "serper" as const;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: ProviderFetch;
  private readonly timeoutMs: number;

  constructor(apiKey: string, options: SerperProviderOptions = {}) {
    if (!apiKey.trim()) throw new SerperProviderError("SERPER_API_KEY is not configured.");
    this.apiKey = apiKey;
    this.endpoint = options.endpoint ?? SERPER_SEARCH_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  async getSerp(input: {
    keyword: string;
    location: SearchLocation;
  }): Promise<SerpSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const requestBody: Record<string, string | number> = {
      q: input.keyword,
      location: input.location.name,
      hl: "en",
      num: 10,
    };
    if (input.location.countryCode) requestBody.gl = input.location.countryCode;

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey,
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
        signal: controller.signal,
      });
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new SerperProviderError("Serper response exceeded the size limit.", response.status);
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
        throw new SerperProviderError("Serper response exceeded the size limit.", response.status);
      }
      if (!response.ok) {
        throw new SerperProviderError(
          `Serper request failed with status ${response.status}.`,
          response.status,
        );
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new SerperProviderError("Serper returned invalid JSON.", response.status);
      }
      return parseSerperResponse(payload, input.keyword, input.location);
    } catch (error) {
      if (error instanceof SerperProviderError) throw error;
      if (controller.signal.aborted) {
        throw new SerperProviderError("Serper request timed out.");
      }
      throw new SerperProviderError(
        error instanceof Error ? error.message : "Serper request failed.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async getKeywordMetrics(): Promise<KeywordMetric[]> {
    throw new KeywordMetricsUnavailableError(this.name);
  }

  async getLocations(query: string): Promise<SearchLocation[]> {
    return [buildSerperLocation(query)];
  }
}

export function createSerperProviderFromEnv() {
  return new SerperProvider(process.env.SERPER_API_KEY ?? "");
}
