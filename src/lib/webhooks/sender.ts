import { createHmac } from "node:crypto";

import { openPinnedResponse, type PinnedResponse } from "../security/pinned-http.ts";
import {
  resolveHostname,
  resolveSafePublicUrl,
  type HostResolver,
  type ResolvedPublicUrl,
  type ValidatedAddress,
} from "../security/public-url.ts";
import type {
  CompletionWebhookPayload,
  WebhookAttemptResult,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = 8_000;
const defaultUserAgent =
  "SearchlightWebhook/0.1 (+https://searchlight.local; assessment completion event)";

export interface WebhookSenderDependencies {
  fetchImpl?: (
    input: string | URL,
    init?: RequestInit,
    resolvedTarget?: ResolvedPublicUrl,
  ) => Promise<Response>;
  now?: () => Date;
  resolver?: HostResolver;
  timeoutMs?: number;
}

export interface ValidatedWebhookDestination {
  addresses: readonly ValidatedAddress[];
  host: string;
  url: URL;
}

export async function validateWebhookDestination(
  value: string,
  resolver: HostResolver = resolveHostname,
): Promise<ValidatedWebhookDestination> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Configured webhook URL is invalid or unsafe.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Configured webhook URL is invalid or unsafe.");
  }
  try {
    const validated = await resolveSafePublicUrl(url, resolver);
    return {
      addresses: validated.addresses,
      host: validated.url.hostname,
      url: validated.url,
    };
  } catch {
    throw new Error("Configured webhook URL is invalid or unsafe.");
  }
}

export function webhookSignature(
  body: string,
  timestamp: string,
  secret: string,
) {
  return `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")}`;
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function sendCompletionWebhookAttempt(
  input: {
    deliveryId: string;
    destination: ValidatedWebhookDestination;
    payload: CompletionWebhookPayload;
    secret?: string;
  },
  dependencies: WebhookSenderDependencies = {},
): Promise<WebhookAttemptResult> {
  const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();
  const body = JSON.stringify(input.payload);
  const headers = new Headers({
    accept: "application/json, text/plain;q=0.8, */*;q=0.1",
    "content-type": "application/json",
    "idempotency-key": `${completionEventKey(input.payload)}:${input.deliveryId}`,
    "user-agent": defaultUserAgent,
    "x-searchlight-delivery": input.deliveryId,
    "x-searchlight-event": input.payload.event,
    "x-searchlight-timestamp": timestamp,
  });
  if (input.secret?.trim()) {
    headers.set(
      "x-searchlight-signature",
      webhookSignature(body, timestamp, input.secret.trim()),
    );
  }

  let pinnedResponse: PinnedResponse | undefined;
  try {
    const signal = AbortSignal.timeout(
      dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const init: RequestInit = {
      body,
      cache: "no-store",
      headers,
      method: "POST",
      redirect: "manual",
      signal,
    };
    const resolvedTarget: ResolvedPublicUrl = {
      addresses: input.destination.addresses,
      url: input.destination.url,
    };
    const response = dependencies.fetchImpl
      ? await dependencies.fetchImpl(input.destination.url, init, resolvedTarget)
      : (pinnedResponse = await openPinnedResponse(
          input.destination.url,
          init,
          input.destination.addresses,
        )).response;
    await response.body?.cancel().catch(() => undefined);
    if (response.ok) {
      return {
        error: null,
        ok: true,
        responseStatus: response.status,
        retryable: false,
      };
    }
    return {
      error: `Webhook endpoint returned status ${response.status}.`,
      ok: false,
      responseStatus: response.status,
      retryable: retryableStatus(response.status),
    };
  } catch {
    return {
      error: "Webhook request could not be completed.",
      ok: false,
      responseStatus: null,
      retryable: true,
    };
  } finally {
    await pinnedResponse?.dispose().catch(() => undefined);
  }
}

function completionEventKey(payload: CompletionWebhookPayload) {
  return `${payload.event}:${payload.assessmentId}`;
}
