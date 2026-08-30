import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

export interface ResolvedAddress {
  address: string;
  family: number;
}

export interface ValidatedAddress {
  address: string;
  family: 4 | 6;
}

export interface ResolvedPublicUrl {
  addresses: readonly ValidatedAddress[];
  url: URL;
}

export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "127.0.0.1",
  "::",
  "::1",
]);

function addressLiteral(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  const candidate =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;

  if (candidate.includes("%")) {
    throw new Error("IP address zone identifiers are not allowed.");
  }

  return isIP(candidate) ? candidate : null;
}

function validatedPublicAddress(address: string): ValidatedAddress {
  if (address.includes("%")) {
    throw new Error("The website resolves to a private or reserved network.");
  }

  const family = isIP(address);
  if (family !== 4 && family !== 6) {
    throw new Error("The website hostname returned an invalid address.");
  }

  let parsed: ReturnType<typeof ipaddr.process>;
  try {
    parsed = ipaddr.process(address);
  } catch {
    throw new Error("The website hostname returned an invalid address.");
  }

  const isAllocatedGlobalIpv6 =
    parsed.kind() !== "ipv6" || (parsed.toByteArray()[0] & 0xe0) === 0x20;
  if (parsed.range() !== "unicast" || !isAllocatedGlobalIpv6) {
    throw new Error("The website resolves to a private or reserved network.");
  }

  return {
    address: parsed.toString(),
    family: parsed.kind() === "ipv4" ? 4 : 6,
  };
}

export function assertSafeHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  if (
    blockedHostnames.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home") ||
    normalized.endsWith(".lan")
  ) {
    throw new Error("The website must use a public hostname.");
  }

  const literal = addressLiteral(normalized);
  if (literal) validatedPublicAddress(literal);
}

export function assertSafeUrlShape(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS websites can be analyzed.");
  }

  if (url.username || url.password) {
    throw new Error("Website URLs cannot contain credentials.");
  }

  if (
    (url.protocol === "http:" && url.port && url.port !== "80") ||
    (url.protocol === "https:" && url.port && url.port !== "443")
  ) {
    throw new Error("Website URLs may only use standard HTTP or HTTPS ports.");
  }

  assertSafeHostname(url.hostname);
}

export const resolveHostname: HostResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export async function resolveSafePublicUrl(
  value: string | URL,
  resolver: HostResolver = resolveHostname,
): Promise<ResolvedPublicUrl> {
  const url = new URL(value);
  assertSafeUrlShape(url);

  const literal = addressLiteral(url.hostname);
  const resolved = literal
    ? [{ address: literal, family: isIP(literal) }]
    : await resolver(url.hostname);
  if (resolved.length === 0) {
    throw new Error("The website hostname did not resolve.");
  }

  const addresses = new Map<string, ValidatedAddress>();
  for (const answer of resolved) {
    const validated = validatedPublicAddress(answer.address);
    addresses.set(`${validated.family}:${validated.address}`, validated);
  }

  url.hash = "";
  return {
    addresses: Object.freeze([...addresses.values()]),
    url,
  };
}

export async function assertSafePublicUrl(
  value: string | URL,
  resolver: HostResolver = resolveHostname,
) {
  return (await resolveSafePublicUrl(value, resolver)).url;
}
