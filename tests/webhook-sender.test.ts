import assert from "node:assert/strict";
import test from "node:test";

import {
  sendCompletionWebhookAttempt,
  validateWebhookDestination,
  webhookSignature,
} from "../src/lib/webhooks/sender.ts";
import type { CompletionWebhookPayload } from "../src/lib/webhooks/types.ts";

const payload: CompletionWebhookPayload = {
  assessmentId: "assessment-123",
  businessName: "Acme Search",
  completedAt: "2026-08-30T12:00:00.000Z",
  event: "seo_assessment.completed",
  opportunityScore: 67,
  status: "complete",
  website: "https://example.com",
};

test("validates a public HTTPS webhook and rejects unsafe destinations", async () => {
  const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];
  const destination = await validateWebhookDestination(
    "https://webhook.example/receive#fragment",
    publicResolver,
  );
  assert.equal(destination.host, "webhook.example");
  assert.equal(destination.url.hash, "");

  await assert.rejects(
    validateWebhookDestination("http://webhook.example/receive", publicResolver),
    /invalid or unsafe/,
  );
  await assert.rejects(
    validateWebhookDestination("https://localhost/receive", publicResolver),
    /invalid or unsafe/,
  );
  await assert.rejects(
    validateWebhookDestination("https://webhook.example/receive", async () => [
      { address: "127.0.0.1", family: 4 },
    ]),
    /invalid or unsafe/,
  );
});

test("sends a signed completion payload without following redirects", async () => {
  let requestBody = "";
  let requestHeaders = new Headers();
  let redirectMode: RequestRedirect | undefined;
  const timestamp = "2026-08-30T12:01:00.000Z";
  const result = await sendCompletionWebhookAttempt(
    {
      deliveryId: "delivery-1",
      destination: {
        host: "webhook.example",
        url: new URL("https://webhook.example/receive"),
      },
      payload,
      secret: "signing-secret",
    },
    {
      now: () => new Date(timestamp),
      fetchImpl: async (_input, init) => {
        requestBody = String(init?.body);
        requestHeaders = new Headers(init?.headers);
        redirectMode = init?.redirect;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.responseStatus, 204);
  assert.equal(redirectMode, "manual");
  assert.deepEqual(JSON.parse(requestBody), payload);
  assert.equal(requestHeaders.get("x-searchlight-event"), payload.event);
  assert.equal(requestHeaders.get("x-searchlight-delivery"), "delivery-1");
  assert.equal(
    requestHeaders.get("x-searchlight-signature"),
    webhookSignature(requestBody, timestamp, "signing-secret"),
  );
  assert.match(
    requestHeaders.get("idempotency-key") ?? "",
    /seo_assessment\.completed:assessment-123:delivery-1/,
  );
});

test("treats redirects as terminal failures and network errors as retryable", async () => {
  const destination = {
    host: "webhook.example",
    url: new URL("https://webhook.example/receive"),
  };
  const redirect = await sendCompletionWebhookAttempt(
    { deliveryId: "delivery-2", destination, payload },
    { fetchImpl: async () => new Response(null, { status: 302 }) },
  );
  assert.deepEqual(redirect, {
    error: "Webhook endpoint returned status 302.",
    ok: false,
    responseStatus: 302,
    retryable: false,
  });

  const network = await sendCompletionWebhookAttempt(
    { deliveryId: "delivery-3", destination, payload },
    { fetchImpl: async () => Promise.reject(new Error("private network detail")) },
  );
  assert.deepEqual(network, {
    error: "Webhook request could not be completed.",
    ok: false,
    responseStatus: null,
    retryable: true,
  });
});
