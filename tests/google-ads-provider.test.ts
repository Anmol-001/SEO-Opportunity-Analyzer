import assert from "node:assert/strict";
import test from "node:test";

import {
  GoogleAdsKeywordMetricsProvider,
  googleAdsCredentialsFromEnv,
} from "../src/lib/providers/google-ads.ts";

const credentials = {
  clientId: "oauth-client-id",
  clientSecret: "oauth-client-secret",
  customerId: "123-456-7890",
  developerToken: "developer-token",
  loginCustomerId: "987-654-3210",
  refreshToken: "refresh-token",
};

test("resolves a location and normalizes Google Ads historical metrics", async () => {
  const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
  let oauthCalls = 0;
  const provider = new GoogleAdsKeywordMetricsProvider(credentials, {
    now: () => 1_000,
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        oauthCalls += 1;
        assert.match(String(init?.body), /grant_type=refresh_token/);
        return new Response(
          JSON.stringify({ access_token: "access-token", expires_in: 3600 }),
          { status: 200 },
        );
      }
      const body = JSON.parse(String(init?.body)) as unknown;
      const headers = new Headers(init?.headers);
      requests.push({ body, headers, url });
      if (url.endsWith("/geoTargetConstants:suggest")) {
        return new Response(
          JSON.stringify({
            geoTargetConstantSuggestions: [
              {
                geoTargetConstant: {
                  resourceName: "geoTargetConstants/1007740",
                  name: "Noida",
                  countryCode: "IN",
                  targetType: "City",
                  status: "ENABLED",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              text: "seo agency noida",
              closeVariants: ["seo agencies noida"],
              keywordMetrics: {
                avgMonthlySearches: "1000",
                averageCpcMicros: "2500000",
                competitionIndex: "72",
                monthlySearchVolumes: [
                  { year: "2026", month: "JULY", monthlySearches: "1200" },
                  { year: "2026", month: "JUNE", monthlySearches: "900" },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

  const [location] = await provider.getLocations("Noida, India");
  const metrics = await provider.getKeywordMetrics({
    keywords: ["seo agency noida", "seo agencies noida"],
    location,
  });

  assert.deepEqual(location, {
    id: "geoTargetConstants/1007740",
    name: "Noida",
    countryCode: "in",
  });
  assert.equal(oauthCalls, 1, "the access token should be reused");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.get("developer-token"), "developer-token");
  assert.equal(requests[0].headers.get("login-customer-id"), "9876543210");
  assert.equal(requests[0].headers.get("authorization"), "Bearer access-token");
  assert.deepEqual(requests[0].body, {
    locale: "en",
    countryCode: "IN",
    locationNames: { names: ["Noida, India"] },
  });
  assert.match(
    requests[1].url,
    /\/v25\/customers\/1234567890:generateKeywordHistoricalMetrics$/,
  );
  assert.deepEqual(metrics, [
    {
      keyword: "seo agency noida",
      searchVolume: 1000,
      cpc: 2.5,
      paidCompetitionSignal: 0.72,
      monthlyTrend: [
        { month: "2026-06", volume: 900 },
        { month: "2026-07", volume: 1200 },
      ],
    },
    {
      keyword: "seo agencies noida",
      searchVolume: 1000,
      cpc: 2.5,
      paidCompetitionSignal: 0.72,
      monthlyTrend: [
        { month: "2026-06", volume: 900 },
        { month: "2026-07", volume: 1200 },
      ],
    },
  ]);
});

test("sanitizes provider failures and rejects partial configuration", async () => {
  const provider = new GoogleAdsKeywordMetricsProvider(credentials, {
    fetchImpl: async () =>
      new Response('{"error":"private provider detail"}', { status: 400 }),
  });
  await assert.rejects(
    provider.getLocations("Delhi, India"),
    /Google Ads OAuth request failed with status 400/,
  );
  assert.throws(
    () =>
      googleAdsCredentialsFromEnv({
        GOOGLE_ADS_CLIENT_ID: "configured",
      }),
    /configuration is incomplete/,
  );
  assert.equal(googleAdsCredentialsFromEnv({}), null);
});
