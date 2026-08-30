import type {
  KeywordMetric,
  KeywordMetricsProvider,
  SearchLocation,
} from "./seo-provider.ts";

const OAUTH_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEFAULT_API_ORIGIN = "https://googleads.googleapis.com";
const DEFAULT_API_VERSION = "v25";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_KEYWORDS = 8;

type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GoogleAdsCredentials {
  clientId: string;
  clientSecret: string;
  customerId: string;
  developerToken: string;
  loginCustomerId: string;
  refreshToken: string;
}

export interface GoogleAdsProviderOptions {
  apiOrigin?: string;
  apiVersion?: string;
  fetchImpl?: ProviderFetch;
  now?: () => number;
  timeoutMs?: number;
}

interface GoogleAdsMetricPayload {
  averageCpcMicros?: unknown;
  avgMonthlySearches?: unknown;
  competitionIndex?: unknown;
  monthlySearchVolumes?: unknown;
}

interface GoogleAdsMetricResult {
  closeVariants?: unknown;
  keywordMetrics?: GoogleAdsMetricPayload;
  text?: unknown;
}

const monthNumbers: Record<string, string> = {
  JANUARY: "01",
  FEBRUARY: "02",
  MARCH: "03",
  APRIL: "04",
  MAY: "05",
  JUNE: "06",
  JULY: "07",
  AUGUST: "08",
  SEPTEMBER: "09",
  OCTOBER: "10",
  NOVEMBER: "11",
  DECEMBER: "12",
};

const countryPatterns: Array<[RegExp, string]> = [
  [/\b(india|bharat)\b/i, "in"],
  [/\b(united states|usa|u\.s\.a\.?|u\.s\.?)\b/i, "us"],
  [/\b(united kingdom|uk|u\.k\.|england|scotland|wales)\b/i, "gb"],
  [/\bcanada\b/i, "ca"],
  [/\baustralia\b/i, "au"],
  [/\bnew zealand\b/i, "nz"],
  [/\bsingapore\b/i, "sg"],
  [/\b(united arab emirates|uae|u\.a\.e\.)\b/i, "ae"],
  [/\bgermany\b/i, "de"],
  [/\bfrance\b/i, "fr"],
  [/\bspain\b/i, "es"],
  [/\bitaly\b/i, "it"],
];

export class GoogleAdsProviderError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "GoogleAdsProviderError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedId(value: string, name: string) {
  const id = value.trim().replace(/-/g, "");
  if (!/^\d{10}$/.test(id)) {
    throw new GoogleAdsProviderError(`${name} must be a 10-digit Google Ads ID.`);
  }
  return id;
}

function requiredSecret(value: string, name: string) {
  const secret = value.trim();
  if (!secret) throw new GoogleAdsProviderError(`${name} is not configured.`);
  return secret;
}

function normalizeKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

function keywordKey(value: string) {
  return normalizeKeyword(value).toLocaleLowerCase("en-US");
}

function finiteNonnegativeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function finiteMicros(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Number((parsed / 1_000_000).toFixed(2))
    : null;
}

function paidCompetition(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? Number((parsed / 100).toFixed(2))
    : null;
}

function monthlyTrend(value: unknown): KeywordMetric["monthlyTrend"] {
  if (!Array.isArray(value)) return null;
  const result = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const year = finiteNonnegativeInteger(item.year);
    const month = typeof item.month === "string" ? monthNumbers[item.month] : null;
    const volume = finiteNonnegativeInteger(item.monthlySearches);
    return year && month && volume !== null
      ? [{ month: `${year}-${month}`, volume }]
      : [];
  });
  return result.length > 0
    ? result.sort((a, b) => a.month.localeCompare(b.month)).slice(-24)
    : null;
}

function inferCountryCode(location: string) {
  return countryPatterns.find(([pattern]) => pattern.test(location))?.[1] ?? "";
}

async function readBoundedJson(response: Response, providerName: string) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new GoogleAdsProviderError(`${providerName} returned an oversized response.`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new GoogleAdsProviderError(`${providerName} returned an oversized response.`);
  }
  if (!response.ok) {
    throw new GoogleAdsProviderError(
      `${providerName} request failed with status ${response.status}.`,
      response.status,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GoogleAdsProviderError(`${providerName} returned invalid JSON.`);
  }
}

function parsedMetric(
  keyword: string,
  payload: GoogleAdsMetricPayload | undefined,
): KeywordMetric {
  return {
    keyword,
    searchVolume: finiteNonnegativeInteger(payload?.avgMonthlySearches),
    cpc: finiteMicros(payload?.averageCpcMicros),
    paidCompetitionSignal: paidCompetition(payload?.competitionIndex),
    monthlyTrend: monthlyTrend(payload?.monthlySearchVolumes),
  };
}

export class GoogleAdsKeywordMetricsProvider implements KeywordMetricsProvider {
  readonly name = "google-ads" as const;
  private readonly apiOrigin: string;
  private readonly apiVersion: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly customerId: string;
  private readonly developerToken: string;
  private readonly fetchImpl: ProviderFetch;
  private readonly loginCustomerId: string;
  private readonly now: () => number;
  private readonly refreshToken: string;
  private readonly timeoutMs: number;
  private accessToken: { expiresAt: number; value: string } | null = null;

  constructor(
    credentials: GoogleAdsCredentials,
    options: GoogleAdsProviderOptions = {},
  ) {
    this.clientId = requiredSecret(credentials.clientId, "GOOGLE_ADS_CLIENT_ID");
    this.clientSecret = requiredSecret(
      credentials.clientSecret,
      "GOOGLE_ADS_CLIENT_SECRET",
    );
    this.customerId = normalizedId(
      credentials.customerId,
      "GOOGLE_ADS_CUSTOMER_ID",
    );
    this.developerToken = requiredSecret(
      credentials.developerToken,
      "GOOGLE_ADS_DEVELOPER_TOKEN",
    );
    this.loginCustomerId = normalizedId(
      credentials.loginCustomerId,
      "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    );
    this.refreshToken = requiredSecret(
      credentials.refreshToken,
      "GOOGLE_ADS_REFRESH_TOKEN",
    );
    this.apiOrigin = (options.apiOrigin ?? DEFAULT_API_ORIGIN).replace(/\/$/, "");
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    if (!/^v\d+$/.test(this.apiVersion)) {
      throw new GoogleAdsProviderError("The Google Ads API version is invalid.");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async getAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt > this.now() + 60_000) {
      return this.accessToken.value;
    }
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
    });
    let response: Response;
    try {
      response = await this.fetchImpl(OAUTH_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new GoogleAdsProviderError("Google Ads OAuth request could not be completed.");
    }
    const payload = await readBoundedJson(response, "Google Ads OAuth");
    if (!isRecord(payload) || typeof payload.access_token !== "string") {
      throw new GoogleAdsProviderError("Google Ads OAuth returned an invalid response.");
    }
    const expiresIn = finiteNonnegativeInteger(payload.expires_in) ?? 3_600;
    this.accessToken = {
      expiresAt: this.now() + expiresIn * 1_000,
      value: payload.access_token,
    };
    return this.accessToken.value;
  }

  private async post(path: string, body: Record<string, unknown>) {
    const request = async () => {
      const accessToken = await this.getAccessToken();
      return this.fetchImpl(`${this.apiOrigin}/${this.apiVersion}/${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "developer-token": this.developerToken,
          "login-customer-id": this.loginCustomerId,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    };
    let response: Response;
    try {
      response = await request();
      if (response.status === 401) {
        await response.body?.cancel();
        this.accessToken = null;
        response = await request();
      }
    } catch (error) {
      if (error instanceof GoogleAdsProviderError) throw error;
      throw new GoogleAdsProviderError("Google Ads API request could not be completed.");
    }
    return readBoundedJson(response, "Google Ads API");
  }

  async getLocations(query: string): Promise<SearchLocation[]> {
    const name = query.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!name) throw new GoogleAdsProviderError("A search location is required.");
    const countryCode = inferCountryCode(name);
    const payload = await this.post("geoTargetConstants:suggest", {
      locale: "en",
      ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}),
      locationNames: { names: [name] },
    });
    if (!isRecord(payload) || !Array.isArray(payload.geoTargetConstantSuggestions)) {
      throw new GoogleAdsProviderError("Google Ads returned invalid location suggestions.");
    }
    const locations = payload.geoTargetConstantSuggestions.flatMap((suggestion) => {
      if (!isRecord(suggestion) || !isRecord(suggestion.geoTargetConstant)) return [];
      const target = suggestion.geoTargetConstant;
      if (
        typeof target.resourceName !== "string" ||
        !/^geoTargetConstants\/\d+$/.test(target.resourceName) ||
        typeof target.name !== "string" ||
        (typeof target.status === "string" && target.status !== "ENABLED")
      ) {
        return [];
      }
      const targetCountry =
        typeof target.countryCode === "string"
          ? target.countryCode.toLowerCase()
          : countryCode;
      return [{ id: target.resourceName, name: target.name, countryCode: targetCountry }];
    });
    if (locations.length === 0) {
      throw new GoogleAdsProviderError("Google Ads could not resolve the search location.");
    }
    return locations.slice(0, 5);
  }

  async getKeywordMetrics(input: {
    keywords: string[];
    location: SearchLocation;
  }): Promise<KeywordMetric[]> {
    const keywords = [...new Set(input.keywords.map(normalizeKeyword).filter(Boolean))]
      .slice(0, MAX_KEYWORDS);
    if (keywords.length === 0) {
      throw new GoogleAdsProviderError("At least one keyword is required.");
    }
    if (!/^geoTargetConstants\/\d+$/.test(input.location.id)) {
      throw new GoogleAdsProviderError("The Google Ads search location is invalid.");
    }
    const payload = await this.post(
      `customers/${this.customerId}:generateKeywordHistoricalMetrics`,
      {
        keywords,
        language: "languageConstants/1000",
        geoTargetConstants: [input.location.id],
        keywordPlanNetwork: "GOOGLE_SEARCH",
        historicalMetricsOptions: { includeAverageCpc: true },
      },
    );
    if (!isRecord(payload) || !Array.isArray(payload.results)) {
      throw new GoogleAdsProviderError("Google Ads returned invalid keyword metrics.");
    }
    const metricByKeyword = new Map<string, GoogleAdsMetricPayload>();
    for (const candidate of payload.results as GoogleAdsMetricResult[]) {
      if (!isRecord(candidate) || !isRecord(candidate.keywordMetrics)) continue;
      const names = [
        typeof candidate.text === "string" ? candidate.text : null,
        ...(Array.isArray(candidate.closeVariants)
          ? candidate.closeVariants.filter(
              (item): item is string => typeof item === "string",
            )
          : []),
      ].filter((item): item is string => Boolean(item));
      for (const name of names) metricByKeyword.set(keywordKey(name), candidate.keywordMetrics);
    }
    return keywords.map((keyword) =>
      parsedMetric(keyword, metricByKeyword.get(keywordKey(keyword))),
    );
  }
}

type Environment = Record<string, string | undefined>;

export function googleAdsCredentialsFromEnv(
  environment: Environment = process.env,
): GoogleAdsCredentials | null {
  const names = [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ] as const;
  const configured = names.filter((name) => environment[name]?.trim());
  if (configured.length === 0) return null;
  if (configured.length !== names.length) {
    throw new GoogleAdsProviderError(
      "Google Ads keyword metrics configuration is incomplete.",
    );
  }
  return {
    clientId: environment.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: environment.GOOGLE_ADS_CLIENT_SECRET!,
    customerId: environment.GOOGLE_ADS_CUSTOMER_ID!,
    developerToken: environment.GOOGLE_ADS_DEVELOPER_TOKEN!,
    loginCustomerId: environment.GOOGLE_ADS_LOGIN_CUSTOMER_ID!,
    refreshToken: environment.GOOGLE_ADS_REFRESH_TOKEN!,
  };
}

export function createGoogleAdsKeywordMetricsProviderFromEnv(
  options: GoogleAdsProviderOptions = {},
) {
  const credentials = googleAdsCredentialsFromEnv();
  return credentials
    ? new GoogleAdsKeywordMetricsProvider(credentials, {
        ...options,
        apiVersion:
          options.apiVersion ??
          (process.env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_API_VERSION),
      })
    : null;
}
