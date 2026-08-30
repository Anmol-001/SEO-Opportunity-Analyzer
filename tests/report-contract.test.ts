import assert from "node:assert/strict";
import test from "node:test";

import { demoReport } from "../src/lib/reports/fixture.ts";
import { opportunityReportSchema } from "../src/lib/reports/schema.ts";

test("the demo report follows the production report schema", () => {
  const result = opportunityReportSchema.safeParse(demoReport);

  assert.equal(result.success, true);
});

test("every demo recommendation links to an existing evidence finding", () => {
  const evidenceIds = new Set([
    ...demoReport.websiteFindings.map(({ id }) => id),
    ...demoReport.serpFindings.map(({ id }) => id),
    ...demoReport.competitorFindings.map(({ id }) => id),
  ]);

  for (const recommendation of demoReport.recommendations) {
    assert.ok(recommendation.evidenceRefs.length > 0);
    assert.equal(
      recommendation.evidenceRefs.every((id) => evidenceIds.has(id)),
      true,
      `${recommendation.id} contains an unresolved evidence reference`,
    );
  }
});
