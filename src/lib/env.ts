const requiredForLiveAnalysis = [
  "DATABASE_URL",
  "GEMINI_API_KEY",
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
] as const;

export function runtimeReadiness() {
  const database = Boolean(process.env.DATABASE_URL);
  const ai = Boolean(process.env.GEMINI_API_KEY);
  const dataForSeo = Boolean(
    process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD,
  );
  const serper = Boolean(process.env.SERPER_API_KEY);
  const webhook = Boolean(process.env.WEBHOOK_URL);
  const analysisMode = process.env.ANALYSIS_MODE ?? "fixture";

  return {
    readyForFixture: database,
    readyForLive: database && ai && (dataForSeo || serper),
    analysisMode,
    services: {
      database,
      ai,
      dataForSeo,
      serper,
      webhook,
    },
    missingForLive: requiredForLiveAnalysis.filter((key) => !process.env[key]),
  };
}
