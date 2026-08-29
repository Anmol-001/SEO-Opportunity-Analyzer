import assert from "node:assert/strict";
import test from "node:test";

import {
  assessmentInputSchema,
  normalizedDomain,
} from "../src/lib/validation/assessment.ts";

const validInput = {
  businessName: "Northstar Dental",
  websiteUrl: "northstardental.com",
  industry: "Dental care",
  location: "Noida",
  primaryService: "Dental implants",
  mainGoal: "Increase qualified consultation enquiries.",
  targetKeywords: "dental implants noida, dental implant cost noida",
};

test("normalizes a website and comma-separated keyword seeds", () => {
  const parsed = assessmentInputSchema.parse(validInput);

  assert.equal(parsed.websiteUrl, "https://northstardental.com");
  assert.deepEqual(parsed.targetKeywords, [
    "dental implants noida",
    "dental implant cost noida",
  ]);
  assert.equal(normalizedDomain(parsed.websiteUrl), "northstardental.com");
});

test("deduplicates keyword seeds", () => {
  const parsed = assessmentInputSchema.parse({
    ...validInput,
    targetKeywords: "dental implants noida\ndental implants noida",
  });

  assert.deepEqual(parsed.targetKeywords, ["dental implants noida"]);
});

test("rejects more than eight keyword seeds", () => {
  const result = assessmentInputSchema.safeParse({
    ...validInput,
    targetKeywords: Array.from({ length: 9 }, (_, index) => `keyword ${index + 1}`),
  });

  assert.equal(result.success, false);
});

test("rejects a non-public hostname and an underspecified goal", () => {
  const result = assessmentInputSchema.safeParse({
    ...validInput,
    websiteUrl: "http://localhost:3000",
    mainGoal: "More SEO",
  });

  assert.equal(result.success, false);
});
