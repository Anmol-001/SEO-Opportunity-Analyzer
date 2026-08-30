import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeHostname,
  resolveSafePublicUrl,
} from "../src/lib/security/public-url.ts";

test("accepts a normal public hostname", () => {
  assert.doesNotThrow(() => assertSafeHostname("example.com"));
});

test("rejects local and internal hostnames", () => {
  for (const hostname of [
    "localhost",
    "api.localhost",
    "service.local",
    "metadata.internal",
  ]) {
    assert.throws(() => assertSafeHostname(hostname));
  }
});

test("rejects private and reserved IPv4 addresses", () => {
  for (const hostname of [
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.10",
    "203.0.113.10",
    "224.0.0.1",
  ]) {
    assert.throws(() => assertSafeHostname(hostname), hostname);
  }
});

test("rejects loopback, local, documentation, and unspecified IPv6 addresses", () => {
  for (const hostname of [
    "::",
    "::1",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "64:ff9b::7f00:1",
    "2001::1",
    "2001:2::1",
    "2001:10::1",
    "2001:20::1",
    "2002:7f00:1::",
    "3fff::1",
    "100::1",
    "fec0::1",
    "::7f00:1",
    "::a9fe:a9fe",
    "::ffff:127.0.0.1",
    "fe80::1%eth0",
  ]) {
    assert.throws(() => assertSafeHostname(hostname), hostname);
  }
});

test("accepts globally routable IPv4 and IPv6 addresses", () => {
  assert.doesNotThrow(() => assertSafeHostname("93.184.216.34"));
  assert.doesNotThrow(() => assertSafeHostname("2606:4700:4700::1111"));
});

test("rejects mixed DNS answers and derives the family from each address", async () => {
  await assert.rejects(
    () =>
      resolveSafePublicUrl("https://example.com", async () => [
        { address: "93.184.216.34", family: 6 },
        { address: "127.0.0.1", family: 6 },
      ]),
    /private or reserved/i,
  );
});

test("returns the exact validated addresses used for a public destination", async () => {
  const resolved = await resolveSafePublicUrl("https://example.com#fragment", async () => [
    { address: "93.184.216.34", family: 6 },
    { address: "2606:4700:4700::1111", family: 4 },
  ]);

  assert.equal(resolved.url.hash, "");
  assert.deepEqual(resolved.addresses, [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
});

test("does not perform DNS lookup for a direct public IPv6 URL", async () => {
  let resolverCalled = false;
  const resolved = await resolveSafePublicUrl(
    "https://[2606:4700:4700::1111]/dns-query",
    async () => {
      resolverCalled = true;
      return [];
    },
  );

  assert.equal(resolverCalled, false);
  assert.deepEqual(resolved.addresses, [
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
});
