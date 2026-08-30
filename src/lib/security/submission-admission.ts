import { Prisma } from "../../generated/prisma/client.ts";
import type { getDb } from "../db.ts";

import {
  retryAfterSeconds,
  SUBMISSION_LIMIT,
  SUBMISSION_WINDOW_MS,
} from "./rate-limit.ts";

type AdmissionDatabase = Pick<ReturnType<typeof getDb>, "$transaction">;

export class SubmissionAdmissionUnavailableError extends Error {
  constructor() {
    super("Submission admission could not be completed safely.");
    this.name = "SubmissionAdmissionUnavailableError";
  }
}

export type SubmissionAdmissionResult =
  | {
      kind: "accepted";
      submission: { id: string; status: string };
    }
  | {
      kind: "limited";
      retryAfter: number;
    };

function isSerializationConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function admitSubmission(
  input: {
    data: Prisma.SubmissionCreateInput;
    fingerprint: string | null;
  },
  dependencies: {
    db: AdmissionDatabase;
    delay?: (milliseconds: number) => Promise<void>;
    maxAttempts?: number;
    now?: () => Date;
  },
): Promise<SubmissionAdmissionResult> {
  const db = dependencies.db;
  const delay = dependencies.delay ?? pause;
  const maxAttempts = Math.max(1, Math.min(dependencies.maxAttempts ?? 3, 5));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const now = (dependencies.now ?? (() => new Date()))();
    try {
      return await db.$transaction(
        async (transaction) => {
          const windowStart = new Date(now.getTime() - SUBMISSION_WINDOW_MS);
          const recent = await transaction.submission.findMany({
            where: {
              requestFingerprint: input.fingerprint,
              createdAt: { gte: windowStart },
            },
            orderBy: { createdAt: "asc" },
            take: SUBMISSION_LIMIT,
            select: { createdAt: true },
          });

          if (recent.length >= SUBMISSION_LIMIT) {
            return {
              kind: "limited" as const,
              retryAfter: retryAfterSeconds(recent[0].createdAt, now),
            };
          }

          const submission = await transaction.submission.create({
            data: input.data,
            select: { id: true, status: true },
          });
          return {
            kind: "accepted" as const,
            submission,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isSerializationConflict(error)) throw error;
      if (attempt === maxAttempts) {
        throw new SubmissionAdmissionUnavailableError();
      }
      await delay(20 * attempt);
    }
  }

  throw new SubmissionAdmissionUnavailableError();
}
