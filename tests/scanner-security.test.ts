import assert from "node:assert/strict";
import test from "node:test";

import { safeFetchText, ScanFetchError } from "../src/lib/scanner/safe-fetch.ts";
import type { HostResolver } from "../src/lib/security/public-url.ts";

const publicResolver: HostResolver = async () => [
  { address: "93.184.216.34", family: 4 },
];

test("validates a redirect target before issuing the redirected request", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: string | URL) => {
    calls.push(input.toString());
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    });
  };

  await assert.rejects(
    () =>
      safeFetchText("https://example.com", {
        fetchImpl,
        resolver: publicResolver,
      }),
    /private|public hostname/i,
  );
  assert.equal(calls.length, 1);
});

test("rejects DNS answers that change to a private address", async () => {
  let resolution = 0;
  const resolver: HostResolver = async () => {
    resolution += 1;
    return resolution === 1
      ? [{ address: "93.184.216.34", family: 4 }]
      : [{ address: "10.0.0.9", family: 4 }];
  };
  const fetchImpl = async () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://example.com/next" },
    });

  await assert.rejects(
    () => safeFetchText("https://example.com", { fetchImpl, resolver }),
    /private or reserved network/i,
  );
});

test("enforces the streamed response-size limit", async () => {
  const fetchImpl = async () =>
    new Response("this response is intentionally too large", {
      status: 200,
      headers: { "content-type": "text/html" },
    });

  await assert.rejects(
    () =>
      safeFetchText("https://example.com", {
        acceptedContentTypes: ["text/html"],
        fetchImpl,
        maxBytes: 10,
        resolver: publicResolver,
      }),
    (error) => error instanceof ScanFetchError && error.code === "CONTENT_TOO_LARGE",
  );
});

test("rejects non-standard ports", async () => {
  await assert.rejects(
    () => safeFetchText("https://example.com:8443", { resolver: publicResolver }),
    /standard HTTP or HTTPS ports/i,
  );
});
