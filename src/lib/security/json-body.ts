const DEFAULT_MAX_JSON_BYTES = 16 * 1_024;

export class JsonBodyError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(message: string, status: 400 | 413 | 415) {
    super(message);
    this.name = "JsonBodyError";
    this.status = status;
  }
}

function declaredLength(request: Request) {
  const value = request.headers.get("content-length");
  if (!value) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function readBoundedJson(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new JsonBodyError("Content-Type must be application/json.", 415);
  }

  const length = declaredLength(request);
  if (length !== null && length > maxBytes) {
    throw new JsonBodyError("Request body is too large.", 413);
  }

  if (!request.body) {
    throw new JsonBodyError("Request body must be valid JSON.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new JsonBodyError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new JsonBodyError("Request body must be valid JSON.", 400);
  }
}
