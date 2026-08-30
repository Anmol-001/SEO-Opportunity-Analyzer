import assert from "node:assert/strict";
import test from "node:test";

import {
  runCompletionWebhookDelivery,
  type WebhookEventStore,
} from "../src/lib/webhooks/delivery.ts";
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

function memoryStore(existingDelivered = false) {
  const created: Parameters<WebhookEventStore["create"]>[0][] = [];
  const updates: Array<{
    id: string;
    value: Parameters<WebhookEventStore["update"]>[1];
  }> = [];
  const store: WebhookEventStore = {
    async findDelivered() {
      return existingDelivered
        ? { attemptCount: 1, id: "existing-event", responseStatus: 200 }
        : null;
    },
    async create(input) {
      created.push(input);
      return { id: `event-${created.length}` };
    },
    async update(id, value) {
      updates.push({ id, value });
    },
  };
  return { created, store, updates };
}

const validatedDestination = {
  addresses: [{ address: "93.184.216.34", family: 4 }] as const,
  host: "webhook.example",
  url: new URL("https://webhook.example/receive"),
};

test("persists a skipped event when no webhook is configured", async () => {
  const memory = memoryStore();
  const result = await runCompletionWebhookDelivery({
    payload,
    store: memory.store,
    submissionId: payload.assessmentId,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.attemptCount, 0);
  assert.equal(memory.created[0].status, "skipped");
  assert.equal(memory.created[0].destinationHost, null);
});

test("retries transient failures and persists the successful attempt", async () => {
  const memory = memoryStore();
  let attempts = 0;
  const result = await runCompletionWebhookDelivery(
    {
      payload,
      secret: "secret",
      store: memory.store,
      submissionId: payload.assessmentId,
      webhookUrl: "https://webhook.example/receive",
    },
    {
      delay: async () => undefined,
      now: () => new Date("2026-08-30T12:01:00.000Z"),
      validateDestination: async () => validatedDestination,
      sendAttempt: async () => {
        attempts += 1;
        return attempts === 1
          ? {
              error: "Webhook endpoint returned status 503.",
              ok: false,
              responseStatus: 503,
              retryable: true,
            }
          : {
              error: null,
              ok: true,
              responseStatus: 200,
              retryable: false,
            };
      },
    },
  );

  assert.equal(result.status, "delivered");
  assert.equal(result.attemptCount, 2);
  assert.equal(memory.created[0].status, "pending");
  assert.equal(memory.created[0].destinationHost, "webhook.example");
  assert.deepEqual(
    memory.updates.map((update) => update.value.status),
    ["pending", "delivered"],
  );
  assert.equal(memory.updates[1].value.responseStatus, 200);
});

test("does not retry a terminal response and avoids duplicate delivered events", async () => {
  const failedMemory = memoryStore();
  let attempts = 0;
  const failed = await runCompletionWebhookDelivery(
    {
      payload,
      store: failedMemory.store,
      submissionId: payload.assessmentId,
      webhookUrl: "https://webhook.example/receive",
    },
    {
      validateDestination: async () => validatedDestination,
      sendAttempt: async () => {
        attempts += 1;
        return {
          error: "Webhook endpoint returned status 400.",
          ok: false,
          responseStatus: 400,
          retryable: false,
        };
      },
    },
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.attemptCount, 1);
  assert.equal(attempts, 1);
  assert.equal(failedMemory.updates[0].value.status, "failed");

  const deliveredMemory = memoryStore(true);
  const delivered = await runCompletionWebhookDelivery({
    payload,
    store: deliveredMemory.store,
    submissionId: payload.assessmentId,
    webhookUrl: "https://webhook.example/receive",
  });
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.eventId, "existing-event");
  assert.equal(deliveredMemory.created.length, 0);
});

test("persists an unsafe configured destination without attempting delivery", async () => {
  const memory = memoryStore();
  let attempted = false;
  const result = await runCompletionWebhookDelivery(
    {
      payload,
      store: memory.store,
      submissionId: payload.assessmentId,
      webhookUrl: "https://localhost/receive",
    },
    {
      validateDestination: async () => {
        throw new Error("private validation detail");
      },
      sendAttempt: async () => {
        attempted = true;
        throw new Error("must not run");
      },
    },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.attemptCount, 0);
  assert.equal(attempted, false);
  assert.equal(memory.created[0].lastError, "Configured webhook URL is invalid or unsafe.");
});
