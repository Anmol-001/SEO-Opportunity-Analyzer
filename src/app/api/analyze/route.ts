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
  SUBMISSION_LIMIT,
} from "@/lib/security/rate-limit";
import {
  admitSubmission,
  SubmissionAdmissionUnavailableError,
} from "@/lib/security/submission-admission";
import {
  assessmentInputSchema,
  normalizedDomain,
} from "@/lib/validation/assessment";

export const maxDuration = 300;
export const runtime = "nodejs";

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

  let admission: Awaited<ReturnType<typeof admitSubmission>>;
  try {
    admission = await admitSubmission(
      {
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
        fingerprint,
      },
      { db },
    );
  } catch (error) {
    if (error instanceof SubmissionAdmissionUnavailableError) {
      return NextResponse.json(
        {
          error: "Assessment capacity is busy. Please try again shortly.",
          code: "ADMISSION_UNAVAILABLE",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }

  if (admission.kind === "limited") {
    return NextResponse.json(
      { error: "Too many assessments. Try again in a few minutes." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(admission.retryAfter),
          "X-RateLimit-Limit": String(SUBMISSION_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const submission = admission.submission;

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
