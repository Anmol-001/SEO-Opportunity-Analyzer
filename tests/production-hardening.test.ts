import assert from "node:assert/strict";
import test from "node:test";

import { runtimeReadiness } from "../src/lib/env.ts";
import {
  ASSESSMENT_HISTORY_LIMIT,
  assessmentHistoryValue,
  parseAssessmentHistory,
} from "../src/lib/security/assessment-history.ts";
import {
  JsonBodyError,
  readBoundedJson,
} from "../src/lib/security/json-body.ts";
import {
  clientAddress,
  requestFingerprint,
  retryAfterSeconds,
} from "../src/lib/security/rate-limit.ts";

test("accepts bounded JSON and rejects unsupported, malformed, or oversized bodies", async () => {
  const valid = new Request("https://searchlight.test/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ businessName: "Northstar Dental" }),
  });
  assert.deepEqual(await readBoundedJson(valid), {
    businessName: "Northstar Dental",
  });

  const unsupported = new Request("https://searchlight.test/api/analyze", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  await assert.rejects(
    readBoundedJson(unsupported),
    (error: unknown) =>
      error instanceof JsonBodyError && error.status === 415,
  );

  const malformed = new Request("https://searchlight.test/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not-json}",
  });
  await assert.rejects(
    readBoundedJson(malformed),
    (error: unknown) =>
      error instanceof JsonBodyError && error.status === 400,
  );

  const oversized = new Request("https://searchlight.test/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(100) }),
  });
  await assert.rejects(
    readBoundedJson(oversized, 32),
    (error: unknown) =>
      error instanceof JsonBodyError && error.status === 413,
  );
});

test("keeps a bounded, deduplicated assessment history cookie", () => {
  const first = "cmtex8dik00mf2kf4fphnjup3";
  const second = "cmtevx2w200jd2kf4w56wcu6p";
  const value = assessmentHistoryValue(`${first}.invalid.${first}`, second);

  assert.deepEqual(parseAssessmentHistory(value), [second, first]);
  assert.deepEqual(parseAssessmentHistory("../../admin.not-an-id"), []);

  const manyIds = Array.from(
    { length: ASSESSMENT_HISTORY_LIMIT + 5 },
    (_, index) => `c${String(index).padStart(20, "0")}`,
  );
  assert.equal(
    parseAssessmentHistory(manyIds.join(".")).length,
    ASSESSMENT_HISTORY_LIMIT,
  );
});

test("uses the closest valid proxy address and hashes it with a deployment salt", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.4, 203.0.113.8",
    "x-real-ip": "192.0.2.7",
  });
  const fingerprint = requestFingerprint(headers, "a".repeat(32));

  assert.equal(clientAddress(headers), "203.0.113.8");
  assert.equal(fingerprint?.length, 64);
  assert.equal(
    fingerprint,
    requestFingerprint(headers, "a".repeat(32)),
  );
  assert.notEqual(
    fingerprint,
    requestFingerprint(headers, "b".repeat(32)),
  );
  assert.equal(clientAddress(new Headers({ "x-real-ip": "not-an-ip" })), null);
  assert.equal(
    retryAfterSeconds(new Date("2026-08-30T00:00:00.000Z"), new Date("2026-08-30T00:14:30.000Z")),
    30,
  );
});

test("makes health readiness depend on the selected analysis mode", () => {
  const completeLiveEnvironment = {
    ANALYSIS_MODE: "live",
    DATABASE_URL: "postgresql://configured",
    GEMINI_API_KEY: "configured",
    SERPER_API_KEY: "configured",
    GOOGLE_ADS_DEVELOPER_TOKEN: "configured",
    GOOGLE_ADS_CUSTOMER_ID: "1234567890",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "9876543210",
    GOOGLE_ADS_CLIENT_ID: "configured",
    GOOGLE_ADS_CLIENT_SECRET: "configured",
    GOOGLE_ADS_REFRESH_TOKEN: "configured",
    WEBHOOK_URL: "https://webhook.example/complete",
    RATE_LIMIT_SALT: "r".repeat(32),
    NEXT_PUBLIC_APP_URL: "https://searchlight.example",
    ENABLE_INFRA_SMOKE: "false",
  };

  const live = runtimeReadiness(completeLiveEnvironment, "production");
  assert.equal(live.analysisMode, "live");
  assert.equal(live.readyForLive, true);
  assert.equal(live.readyForCurrentMode, true);
  assert.equal(live.services.googleAds, true);

  const missingGoogleAds = runtimeReadiness(
    { ...completeLiveEnvironment, GOOGLE_ADS_REFRESH_TOKEN: "" },
    "production",
  );
  assert.equal(missingGoogleAds.readyForLive, false);
  assert.ok(
    missingGoogleAds.missingForLive.includes("complete GOOGLE_ADS_* credentials"),
  );

  const weakSalt = runtimeReadiness(
    { ...completeLiveEnvironment, RATE_LIMIT_SALT: "replace-with-a-long-random-value" },
    "production",
  );
  assert.equal(weakSalt.readyForLive, false);
  assert.ok(weakSalt.missingForLive.some((item) => item.startsWith("RATE_LIMIT_SALT")));

  const unsafeOrigin = runtimeReadiness(
    { ...completeLiveEnvironment, NEXT_PUBLIC_APP_URL: "http://searchlight.example" },
    "production",
  );
  assert.equal(unsafeOrigin.readyForLive, false);

  const unsafeWebhook = runtimeReadiness(
    { ...completeLiveEnvironment, WEBHOOK_URL: "http://webhook.example/complete" },
    "production",
  );
  assert.equal(unsafeWebhook.readyForLive, false);

  const fixtureDevelopment = runtimeReadiness(
    { ANALYSIS_MODE: "fixture", DATABASE_URL: "postgresql://configured" },
    "development",
  );
  assert.equal(fixtureDevelopment.readyForCurrentMode, true);

  const invalid = runtimeReadiness(
    { ANALYSIS_MODE: "unexpected", DATABASE_URL: "postgresql://configured" },
    "development",
  );
  assert.equal(invalid.analysisMode, "invalid");
  assert.equal(invalid.readyForCurrentMode, false);
});
