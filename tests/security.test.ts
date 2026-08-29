import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeHostname } from "../src/lib/security/public-url.ts";

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
    "224.0.0.1",
  ]) {
    assert.throws(() => assertSafeHostname(hostname), hostname);
  }
});

test("rejects loopback, local, and unspecified IPv6 addresses", () => {
  for (const hostname of ["::", "::1", "fc00::1", "fd00::1", "fe80::1"]) {
    assert.throws(() => assertSafeHostname(hostname), hostname);
  }
});
