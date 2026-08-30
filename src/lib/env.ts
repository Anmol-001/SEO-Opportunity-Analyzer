type RuntimeEnvironment = Record<string, string | undefined>;

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function validSecret(value: string | undefined) {
  const candidate = value?.trim() ?? "";
  return candidate.length >= 32 && !candidate.startsWith("replace-with-");
}

function validPublicOrigin(value: string | undefined, production: boolean) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || (!production && url.protocol === "http:")) &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function validWebhook(value: string | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.port === "" || url.port === "443") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export function runtimeReadiness(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
) {
  const production = nodeEnvironment === "production";
  const database = configured(environment.DATABASE_URL);
  const ai = configured(environment.GEMINI_API_KEY);
  const serper = configured(environment.SERPER_API_KEY);
  const googleAds = [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ].every((name) => configured(environment[name]));
  const webhook = validWebhook(environment.WEBHOOK_URL);
  const rateLimit = validSecret(environment.RATE_LIMIT_SALT);
  const publicOrigin = validPublicOrigin(
    environment.NEXT_PUBLIC_APP_URL,
    production,
  );
  const smokeProbe =
    environment.ENABLE_INFRA_SMOKE !== "true" ||
    validSecret(environment.SMOKE_TEST_TOKEN);
  const configuredMode = environment.ANALYSIS_MODE ?? "fixture";
  const analysisMode =
    configuredMode === "fixture" || configuredMode === "live"
      ? configuredMode
      : "invalid";
  const missingForLive: string[] = [];
  if (!database) missingForLive.push("DATABASE_URL");
  if (!ai) missingForLive.push("GEMINI_API_KEY");
  if (!serper) missingForLive.push("SERPER_API_KEY");
  if (!googleAds) missingForLive.push("complete GOOGLE_ADS_* credentials");
  if (!webhook) missingForLive.push("WEBHOOK_URL");
  if (!rateLimit) missingForLive.push("RATE_LIMIT_SALT (at least 32 random characters)");
  if (!publicOrigin) missingForLive.push("NEXT_PUBLIC_APP_URL (trusted HTTPS origin)");
  if (!smokeProbe) missingForLive.push("SMOKE_TEST_TOKEN (at least 32 random characters)");

  const readyForFixture = database && (!production || rateLimit);
  const readyForLive =
    database &&
    ai &&
    serper &&
    googleAds &&
    webhook &&
    rateLimit &&
    publicOrigin &&
    smokeProbe;
  const readyForCurrentMode =
    analysisMode === "fixture"
      ? readyForFixture
      : analysisMode === "live"
        ? readyForLive
        : false;

  return {
    readyForFixture,
    readyForLive,
    readyForCurrentMode,
    analysisMode,
    services: {
      database,
      ai,
      serper,
      googleAds,
      webhook,
      rateLimit,
      publicOrigin,
      smokeProbe,
    },
    missingForLive,
  };
}
