import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ResolvedAddress {
  address: string;
  family: number;
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

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function mappedIpv4(address: string) {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith("::ffff:")) return null;
  const candidate = normalized.slice("::ffff:".length);
  return isIP(candidate) === 4 ? candidate : null;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  const mapped = mappedIpv4(normalized);
  if (mapped) return isPrivateIpv4(mapped);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") ||
    normalized === "2001:db8::"
  );
}

function assertPublicAddress(address: string, family: number) {
  if (
    (family === 4 && isPrivateIpv4(address)) ||
    (family === 6 && isPrivateIpv6(address))
  ) {
    throw new Error("The website resolves to a private or reserved network.");
  }
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

  const ipVersion = isIP(normalized);
  if (ipVersion) assertPublicAddress(normalized, ipVersion);
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

export async function assertSafePublicUrl(
  value: string | URL,
  resolver: HostResolver = resolveHostname,
) {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  assertSafeUrlShape(url);

  const addresses = await resolver(url.hostname);
  if (addresses.length === 0) {
    throw new Error("The website hostname did not resolve.");
  }

  for (const { address, family } of addresses) {
    assertPublicAddress(address, family);
  }

  url.hash = "";
  return url;
}
