import { after, type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { runtimeReadiness } from "@/lib/env";
import { runAnalysisPipeline } from "@/lib/pipeline/analysis-pipeline";
import {
  ASSESSMENT_HISTORY_COOKIE,
  ASSESSMENT_HISTORY_MAX_AGE,
  assessmentHistoryValue,
} from "@/lib/security/assessment-history";
import { JsonBodyError, readBoundedJson } from "@/lib/security/json-body";
import { assertSafePublicUrl } from "@/lib/security/public-url";
import {
  requestFingerprint,
  retryAfterSeconds,
  SUBMISSION_LIMIT,
  SUBMISSION_WINDOW_MS,
} from "@/lib/security/rate-limit";
import {
  assessmentInputSchema,
  normalizedDomain,
} from "@/lib/validation/assessment";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const readiness = runtimeReadiness();

  if (!readiness.services.database) {
    return NextResponse.json(
      {
        error: "Database is not configured.",
        code: "CONFIGURATION_REQUIRED",
      },
      { status: 503 },
    );
  }

  if (readiness.analysisMode === "invalid") {
    return NextResponse.json(
      {
        error: "ANALYSIS_MODE must be either fixture or live.",
        code: "INVALID_ANALYSIS_MODE",
      },
      { status: 503 },
    );
  }

  if (!readiness.readyForCurrentMode) {
    return NextResponse.json(
      {
        error: "The selected analysis mode is not fully configured.",
        code: "CONFIGURATION_REQUIRED",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Request body could not be read." },
      { status: 400 },
    );
  }

  const parsed = assessmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted assessment fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  try {
    await assertSafePublicUrl(parsed.data.websiteUrl);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Website URL is not safe to fetch.",
        fieldErrors: {
          websiteUrl: ["Enter a reachable public website URL."],
        },
      },
      { status: 422 },
    );
  }

  const db = getDb();
  const fingerprint = requestFingerprint(
    request.headers,
    process.env.RATE_LIMIT_SALT ?? "searchlight-local-development-only",
  );

  if (fingerprint) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - SUBMISSION_WINDOW_MS);
    const recent = await db.submission.findMany({
      where: {
        requestFingerprint: fingerprint,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "asc" },
      take: SUBMISSION_LIMIT,
      select: { createdAt: true },
    });

    if (recent.length >= SUBMISSION_LIMIT) {
      const retryAfter = retryAfterSeconds(recent[0].createdAt, now);
      return NextResponse.json(
        { error: "Too many assessments. Try again in a few minutes." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(SUBMISSION_LIMIT),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
  }

  const submission = await db.submission.create({
    data: {
      businessName: parsed.data.businessName,
      websiteUrl: parsed.data.websiteUrl,
      normalizedDomain: normalizedDomain(parsed.data.websiteUrl),
      industry: parsed.data.industry,
      location: parsed.data.location,
      primaryService: parsed.data.primaryService,
      mainGoal: parsed.data.mainGoal,
      targetKeywords: parsed.data.targetKeywords,
      requestFingerprint: fingerprint,
      progressMessage: "Assessment received",
    },
    select: { id: true, status: true },
  });

  after(async () => {
    await runAnalysisPipeline(submission.id);
  });

  const response = NextResponse.json(
    {
      assessmentId: submission.id,
      status: submission.status,
      statusUrl: `/api/assessments/${submission.id}`,
      processingUrl: `/assessment/${submission.id}/processing`,
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: ASSESSMENT_HISTORY_COOKIE,
    value: assessmentHistoryValue(
      request.cookies.get(ASSESSMENT_HISTORY_COOKIE)?.value,
      submission.id,
    ),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ASSESSMENT_HISTORY_MAX_AGE,
    priority: "high",
  });

  return response;
}
