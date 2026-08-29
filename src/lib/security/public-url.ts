import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
]);

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(Number.isNaN)) return false;

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

export function assertSafeHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  if (
    blockedHostnames.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    throw new Error("The website must use a public hostname.");
  }

  const ipVersion = isIP(normalized);
  if (
    (ipVersion === 4 && isPrivateIpv4(normalized)) ||
    (ipVersion === 6 && isPrivateIpv6(normalized))
  ) {
    throw new Error("Private and reserved network addresses are not allowed.");
  }
}

export async function assertSafePublicUrl(value: string) {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS websites can be analyzed.");
  }

  if (url.username || url.password) {
    throw new Error("Website URLs cannot contain credentials.");
  }

  assertSafeHostname(url.hostname);

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("The website hostname did not resolve.");
  }

  for (const { address, family } of addresses) {
    if (
      (family === 4 && isPrivateIpv4(address)) ||
      (family === 6 && isPrivateIpv6(address))
    ) {
      throw new Error("The website resolves to a private or reserved network.");
    }
  }

  return url;
}
