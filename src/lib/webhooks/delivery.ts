import {
  sendCompletionWebhookAttempt,
  validateWebhookDestination,
  type ValidatedWebhookDestination,
} from "./sender.ts";
import {
  completionEventType,
  type CompletionWebhookPayload,
  type WebhookAttemptResult,
  type WebhookDeliveryOutcome,
} from "./types.ts";

export interface WebhookEventStore {
  create(input: {
    attemptCount: number;
    destinationHost: string | null;
    eventType: string;
    lastError: string | null;
    payload: CompletionWebhookPayload;
    status: "pending" | "failed" | "skipped";
  }): Promise<{ id: string }>;
  findDelivered(input: {
    eventType: string;
    submissionId: string;
  }): Promise<{
    attemptCount: number;
    id: string;
    responseStatus: number | null;
  } | null>;
  update(
    id: string,
    input: {
      attemptCount: number;
      deliveredAt?: Date | null;
      lastError: string | null;
      responseStatus: number | null;
      status: "pending" | "delivered" | "failed";
    },
  ): Promise<void>;
}

export interface WebhookDeliveryDependencies {
  delay?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
  now?: () => Date;
  sendAttempt?: (
    input: {
      deliveryId: string;
      destination: ValidatedWebhookDestination;
      payload: CompletionWebhookPayload;
      secret?: string;
    },
  ) => Promise<WebhookAttemptResult>;
  validateDestination?: (value: string) => Promise<ValidatedWebhookDestination>;
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function runCompletionWebhookDelivery(
  input: {
    payload: CompletionWebhookPayload;
    secret?: string;
    store: WebhookEventStore;
    submissionId: string;
    webhookUrl?: string;
  },
  dependencies: WebhookDeliveryDependencies = {},
): Promise<WebhookDeliveryOutcome> {
  const existing = await input.store.findDelivered({
    eventType: completionEventType,
    submissionId: input.submissionId,
  });
  if (existing?.responseStatus) {
    return {
      attemptCount: existing.attemptCount,
      eventId: existing.id,
      responseStatus: existing.responseStatus,
      status: "delivered",
    };
  }

  if (!input.webhookUrl?.trim()) {
    const event = await input.store.create({
      attemptCount: 0,
      destinationHost: null,
      eventType: completionEventType,
      lastError: "WEBHOOK_URL is not configured.",
      payload: input.payload,
      status: "skipped",
    });
    return {
      attemptCount: 0,
      eventId: event.id,
      responseStatus: null,
      status: "skipped",
    };
  }

  let destination: ValidatedWebhookDestination;
  try {
    destination = await (
      dependencies.validateDestination ?? validateWebhookDestination
    )(input.webhookUrl.trim());
  } catch {
    const event = await input.store.create({
      attemptCount: 0,
      destinationHost: null,
      eventType: completionEventType,
      lastError: "Configured webhook URL is invalid or unsafe.",
      payload: input.payload,
      status: "failed",
    });
    return {
      attemptCount: 0,
      eventId: event.id,
      responseStatus: null,
      status: "failed",
    };
  }

  const event = await input.store.create({
    attemptCount: 0,
    destinationHost: destination.host,
    eventType: completionEventType,
    lastError: null,
    payload: input.payload,
    status: "pending",
  });
  const maxAttempts = Math.max(1, Math.min(dependencies.maxAttempts ?? 2, 3));
  const delay = dependencies.delay ?? pause;
  const sendAttempt =
    dependencies.sendAttempt ??
    ((request) => sendCompletionWebhookAttempt(request, { now: dependencies.now }));
  let lastResult: WebhookAttemptResult = {
    error: "Webhook request could not be completed.",
    ok: false,
    responseStatus: null,
    retryable: false,
  };
  let attemptCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptCount = attempt;
    lastResult = await sendAttempt({
      deliveryId: event.id,
      destination,
      payload: input.payload,
      secret: input.secret,
    });
    if (lastResult.ok && lastResult.responseStatus !== null) {
      await input.store.update(event.id, {
        attemptCount: attempt,
        deliveredAt: (dependencies.now ?? (() => new Date()))(),
        lastError: null,
        responseStatus: lastResult.responseStatus,
        status: "delivered",
      });
      return {
        attemptCount: attempt,
        eventId: event.id,
        responseStatus: lastResult.responseStatus,
        status: "delivered",
      };
    }
    const finalAttempt = attempt === maxAttempts || !lastResult.retryable;
    await input.store.update(event.id, {
      attemptCount: attempt,
      deliveredAt: null,
      lastError: lastResult.error,
      responseStatus: lastResult.responseStatus,
      status: finalAttempt ? "failed" : "pending",
    });
    if (finalAttempt) break;
    await delay(250 * attempt);
  }

  return {
    attemptCount,
    eventId: event.id,
    responseStatus: lastResult.responseStatus,
    status: "failed",
  };
}
