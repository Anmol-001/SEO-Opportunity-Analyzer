import assert from "node:assert/strict";
import test from "node:test";

import { discoverQueries } from "../src/lib/research/query-discovery.ts";

const baseInput = {
  industry: "Dental Care",
  location: "Noida, India",
  mainGoal: "Generate more qualified appointment leads",
  primaryService: "Dental Implants",
};

test("builds a deterministic, intent-diverse query set", () => {
  const queries = discoverQueries(baseInput);

  assert.equal(queries.length, 7);
  assert.equal(queries[0].keyword, "dental implants noida, india");
  assert.deepEqual(
    [...new Set(queries.map((query) => query.intent))].sort(),
    ["commercial", "informational", "local", "transactional"],
  );
  assert.ok(queries.some((query) => query.cluster === "pricing"));
  assert.ok(queries.some((query) => query.cluster === "local"));
});

test("keeps normalized user keywords first and caps usage at eight", () => {
  const queries = discoverQueries({
    ...baseInput,
    targetKeywords: [
      " Dental Implant Cost Noida ",
      "dental implants near me",
      "DENTAL IMPLANT COST NOIDA",
    ],
  });

  assert.equal(queries[0].keyword, "dental implant cost noida");
  assert.equal(queries[0].intent, "transactional");
  assert.equal(queries[1].keyword, "dental implants near me");
  assert.equal(queries[1].intent, "local");
  assert.equal(queries.length, 8);
  assert.equal(new Set(queries.map((query) => query.keyword)).size, 8);
});
