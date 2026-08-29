import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const SUBMISSION_LIMIT = 3;
export const SUBMISSION_WINDOW_MS = 15 * 60 * 1_000;

function normalizedAddress(value: string | null) {
  if (!value) return null;
  const candidate = value.trim();
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const addresses = forwarded.split(",");
    const closestAddress = normalizedAddress(addresses.at(-1) ?? null);
    if (closestAddress) return closestAddress;
  }

  return normalizedAddress(headers.get("x-real-ip"));
}

export function requestFingerprint(headers: Headers, salt: string) {
  const address = clientAddress(headers);
  if (!address) return null;

  return createHash("sha256")
    .update(`${salt}:submission:${address}`)
    .digest("hex");
}

export function retryAfterSeconds(oldestCreatedAt: Date, now = new Date()) {
  const resetAt = oldestCreatedAt.getTime() + SUBMISSION_WINDOW_MS;
  return Math.max(1, Math.ceil((resetAt - now.getTime()) / 1_000));
}
