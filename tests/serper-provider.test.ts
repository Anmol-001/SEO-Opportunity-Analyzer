import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSerperLocation,
  SerperProvider,
} from "../src/lib/providers/serper.ts";

test("sends a localized request and normalizes Serper evidence", async () => {
  let requestBody: Record<string, unknown> | null = null;
  let apiKeyHeader: string | null = null;
  const provider = new SerperProvider("test-key", {
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      apiKeyHeader = new Headers(init?.headers).get("x-api-key");
      return new Response(
        JSON.stringify({
          organic: [
            {
              title: "Northstar Dental",
              link: "https://www.northstar.example/implants",
              snippet: "Implant care in Noida.",
              position: 3,
            },
            { title: "Missing URL", position: 4 },
          ],
          ads: [{ title: "Sponsored" }],
          answerBox: { answer: "A featured answer" },
          peopleAlsoAsk: [{ question: "How much?" }],
          places: [{ title: "Northstar Dental" }],
          relatedSearches: [
            { query: "implant price noida" },
            "dental clinic near me",
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const location = buildSerperLocation("Noida, India");
  const result = await provider.getSerp({
    keyword: "dental implants noida",
    location,
  });

  assert.deepEqual(requestBody, {
    q: "dental implants noida",
    location: "Noida, India",
    hl: "en",
    num: 10,
    gl: "in",
  });
  assert.equal(apiKeyHeader, "test-key");
  assert.equal(result.organicResults.length, 1);
  assert.equal(result.organicResults[0].domain, "northstar.example");
  assert.deepEqual(result.features, [
    "ads",
    "featured_answer",
    "people_also_ask",
    "local_pack",
  ]);
  assert.deepEqual(result.relatedSearches, [
    "implant price noida",
    "dental clinic near me",
  ]);
});

test("returns a sanitized provider error for non-success responses", async () => {
  const provider = new SerperProvider("test-key", {
    fetchImpl: async () =>
      new Response('{"message":"secret provider detail"}', { status: 401 }),
  });

  await assert.rejects(
    provider.getSerp({
      keyword: "test query",
      location: buildSerperLocation("Delhi, India"),
    }),
    /Serper request failed with status 401/,
  );
});
