import assert from "node:assert/strict";
import test from "node:test";

import {
  admitSubmission,
  SubmissionAdmissionUnavailableError,
} from "../src/lib/security/submission-admission.ts";

const submissionData = {
  businessName: "Northstar Dental",
  websiteUrl: "https://example.com",
  normalizedDomain: "example.com",
  industry: "Dental care",
  location: "Noida",
  primaryService: "Dental implants",
  mainGoal: "Increase qualified consultation enquiries.",
  targetKeywords: ["dental implants noida"],
  requestFingerprint: "fingerprint",
  progressMessage: "Assessment received",
};

function fakeDatabase(input: { conflicts?: number; recent?: Date[] }) {
  let conflicts = input.conflicts ?? 0;
  let createCount = 0;
  const isolationLevels: unknown[] = [];
  const db = {
    async $transaction(
      callback: (transaction: unknown) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) {
      isolationLevels.push(options.isolationLevel);
      if (conflicts > 0) {
        conflicts -= 1;
        throw { code: "P2034" };
      }
      return callback({
        submission: {
          findMany: async () =>
            (input.recent ?? []).map((createdAt) => ({ createdAt })),
          create: async () => {
            createCount += 1;
            return { id: "submission-1", status: "queued" };
          },
        },
      });
    },
  };
  return {
    createCount: () => createCount,
    db: db as never,
    isolationLevels,
  };
}

test("counts and creates inside one serializable admission transaction", async () => {
  const fake = fakeDatabase({ recent: [] });
  const result = await admitSubmission(
    { data: submissionData, fingerprint: "fingerprint" },
    { db: fake.db, now: () => new Date("2026-08-31T12:00:00.000Z") },
  );

  assert.equal(result.kind, "accepted");
  assert.equal(fake.createCount(), 1);
  assert.equal(String(fake.isolationLevels[0]).toLowerCase(), "serializable");
});

test("rejects a full window without creating a submission", async () => {
  const now = new Date("2026-08-31T12:00:00.000Z");
  const fake = fakeDatabase({
    recent: [
      new Date(now.getTime() - 60_000),
      new Date(now.getTime() - 30_000),
      new Date(now.getTime() - 10_000),
    ],
  });
  const result = await admitSubmission(
    { data: submissionData, fingerprint: "fingerprint" },
    { db: fake.db, now: () => now },
  );

  assert.equal(result.kind, "limited");
  assert.equal(fake.createCount(), 0);
  if (result.kind === "limited") assert.equal(result.retryAfter, 840);
});

test("retries serialization conflicts and then accepts", async () => {
  const fake = fakeDatabase({ conflicts: 1 });
  const delays: number[] = [];
  const result = await admitSubmission(
    { data: submissionData, fingerprint: "fingerprint" },
    {
      db: fake.db,
      delay: async (milliseconds) => {
        delays.push(milliseconds);
      },
    },
  );

  assert.equal(result.kind, "accepted");
  assert.deepEqual(delays, [20]);
  assert.equal(fake.createCount(), 1);
});

test("fails closed after repeated serialization conflicts", async () => {
  const fake = fakeDatabase({ conflicts: 5 });
  await assert.rejects(
    () =>
      admitSubmission(
        { data: submissionData, fingerprint: "fingerprint" },
        { db: fake.db, delay: async () => undefined, maxAttempts: 3 },
      ),
    SubmissionAdmissionUnavailableError,
  );
  assert.equal(fake.createCount(), 0);
});

test("applies the same conservative limit when no client fingerprint is available", async () => {
  const now = new Date("2026-08-31T12:00:00.000Z");
  const fake = fakeDatabase({
    recent: [
      new Date(now.getTime() - 90_000),
      new Date(now.getTime() - 60_000),
      new Date(now.getTime() - 30_000),
    ],
  });
  const result = await admitSubmission(
    {
      data: { ...submissionData, requestFingerprint: null },
      fingerprint: null,
    },
    { db: fake.db, now: () => now },
  );

  assert.equal(result.kind, "limited");
  assert.equal(fake.createCount(), 0);
});
