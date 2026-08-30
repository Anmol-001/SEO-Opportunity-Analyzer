import { openPinnedResponse, type PinnedResponse } from "../security/pinned-http.ts";
import {
  resolveHostname,
  resolveSafePublicUrl,
  type HostResolver,
  type ResolvedPublicUrl,
} from "../security/public-url.ts";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
  resolvedTarget?: ResolvedPublicUrl,
) => Promise<Response>;

export interface SafeFetchOptions {
  acceptedContentTypes?: string[];
  fetchImpl?: FetchLike;
  maxBytes?: number;
  maxRedirects?: number;
  resolver?: HostResolver;
  timeoutMs?: number;
}

export interface SafeFetchResult {
  body: string;
  contentType: string | null;
  finalUrl: URL;
  headers: Headers;
  redirects: string[];
  status: number;
}

export class ScanFetchError extends Error {
  readonly code:
    | "CONTENT_TOO_LARGE"
    | "INVALID_CONTENT_TYPE"
    | "NETWORK_ERROR"
    | "REDIRECT_LIMIT"
    | "REDIRECT_LOOP"
    | "TIMEOUT";
  readonly targetUrl: string;

  constructor(
    message: string,
    code:
      | "CONTENT_TOO_LARGE"
      | "INVALID_CONTENT_TYPE"
      | "NETWORK_ERROR"
      | "REDIRECT_LIMIT"
      | "REDIRECT_LOOP"
      | "TIMEOUT",
    targetUrl: string,
  ) {
    super(message);
    this.name = "ScanFetchError";
    this.code = code;
    this.targetUrl = targetUrl;
  }
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const defaultUserAgent =
  "SearchlightBot/0.1 (+https://searchlight.local; focused SEO research scan)";

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    await reader.cancel().catch(() => undefined);
    throw signal.reason instanceof Error ? signal.reason : new Error("Request aborted.");
  }

  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const onAbort = () => {
      void reader.cancel().catch(() => undefined);
      reject(signal.reason instanceof Error ? signal.reason : new Error("Request aborted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
  targetUrl: string,
  signal: AbortSignal,
) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ScanFetchError(
      `Response exceeded the ${maxBytes.toLocaleString()} byte limit.`,
      "CONTENT_TOO_LARGE",
      targetUrl,
    );
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";
  let completed = false;

  try {
    while (true) {
      const { done, value } = await readChunk(reader, signal);
      if (done) break;
      received += value.byteLength;

      if (received > maxBytes) {
        throw new ScanFetchError(
          `Response exceeded the ${maxBytes.toLocaleString()} byte limit.`,
          "CONTENT_TOO_LARGE",
          targetUrl,
        );
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
    completed = true;
    return body;
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
  }
}

function assertAcceptedContentType(
  contentType: string | null,
  acceptedContentTypes: string[] | undefined,
  targetUrl: string,
) {
  if (!contentType || !acceptedContentTypes?.length) return;
  const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
  const accepted = acceptedContentTypes.some((candidate) =>
    mimeType.startsWith(candidate.toLowerCase()),
  );

  if (!accepted) {
    throw new ScanFetchError(
      `Unsupported response content type: ${mimeType}.`,
      "INVALID_CONTENT_TYPE",
      targetUrl,
    );
  }
}

export async function safeFetchText(
  initialUrl: string | URL,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const resolver = options.resolver ?? resolveHostname;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const redirects: string[] = [];
  const seen = new Set<string>();
  let currentUrl = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const resolvedTarget = await resolveSafePublicUrl(currentUrl, resolver);
    currentUrl = resolvedTarget.url;
    const normalized = currentUrl.toString();
    if (seen.has(normalized)) {
      throw new ScanFetchError(
        "The website entered a redirect loop.",
        "REDIRECT_LOOP",
        normalized,
      );
    }
    seen.add(normalized);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let pinnedResponse: PinnedResponse | undefined;

    try {
      const init: RequestInit = {
        cache: "no-store",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1",
          "User-Agent": defaultUserAgent,
        },
        redirect: "manual",
        signal: controller.signal,
      };
      const response = options.fetchImpl
        ? await options.fetchImpl(currentUrl, init, resolvedTarget)
        : (pinnedResponse = await openPinnedResponse(
            currentUrl,
            init,
            resolvedTarget.addresses,
          )).response;

      if (redirectStatuses.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          return {
            body: "",
            contentType: response.headers.get("content-type"),
            finalUrl: currentUrl,
            headers: response.headers,
            redirects,
            status: response.status,
          };
        }

        if (redirectCount === maxRedirects) {
          throw new ScanFetchError(
            `Website exceeded the ${maxRedirects} redirect limit.`,
            "REDIRECT_LIMIT",
            normalized,
          );
        }

        const nextUrl = new URL(location, currentUrl);
        nextUrl.hash = "";
        redirects.push(nextUrl.toString());
        currentUrl = nextUrl;
        continue;
      }

      const contentType = response.headers.get("content-type");
      try {
        assertAcceptedContentType(
          contentType,
          options.acceptedContentTypes,
          normalized,
        );
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        throw error;
      }
      const body = await readLimitedBody(
        response,
        maxBytes,
        normalized,
        controller.signal,
      );

      return {
        body,
        contentType,
        finalUrl: currentUrl,
        headers: response.headers,
        redirects,
        status: response.status,
      };
    } catch (error) {
      if (error instanceof ScanFetchError) throw error;
      if (controller.signal.aborted) {
        throw new ScanFetchError(
          `Website request timed out after ${timeoutMs}ms.`,
          "TIMEOUT",
          normalized,
        );
      }

      throw new ScanFetchError(
        error instanceof Error
          ? `Website request failed: ${error.message}`
          : "Website request failed.",
        "NETWORK_ERROR",
        normalized,
      );
    } finally {
      await pinnedResponse?.dispose().catch(() => undefined);
      clearTimeout(timeout);
    }
  }

  throw new ScanFetchError(
    `Website exceeded the ${maxRedirects} redirect limit.`,
    "REDIRECT_LIMIT",
    currentUrl.toString(),
  );
}
