export function runtimeReadiness() {
  const database = Boolean(process.env.DATABASE_URL);
  const ai = Boolean(process.env.GEMINI_API_KEY);
  const dataForSeo = Boolean(
    process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD,
  );
  const serper = Boolean(process.env.SERPER_API_KEY);
  const webhook = Boolean(process.env.WEBHOOK_URL);
  const analysisMode = process.env.ANALYSIS_MODE ?? "fixture";
  const missingForLive: string[] = [];
  if (!database) missingForLive.push("DATABASE_URL");
  if (!ai) missingForLive.push("GEMINI_API_KEY");
  if (!dataForSeo && !serper) {
    missingForLive.push(
      "DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD or SERPER_API_KEY",
    );
  }

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
    missingForLive,
  };
}
