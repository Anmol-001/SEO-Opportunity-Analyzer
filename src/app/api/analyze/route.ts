import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { runtimeReadiness } from "@/lib/env";
import { runFixturePipeline } from "@/lib/pipeline/fixture-pipeline";
import { assertSafePublicUrl } from "@/lib/security/public-url";
import {
  assessmentInputSchema,
  normalizedDomain,
} from "@/lib/validation/assessment";

export const maxDuration = 300;

function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded ?? request.headers.get("x-real-ip");
  if (!address) return null;

  return createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? "local-development"}:${address}`)
    .digest("hex");
}

export async function POST(request: Request) {
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

  if (readiness.analysisMode !== "fixture") {
    return NextResponse.json(
      {
        error: "The live research pipeline is not connected in this initial phase.",
        code: "LIVE_PIPELINE_NOT_READY",
      },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
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
        error: error instanceof Error ? error.message : "Website URL is not safe to fetch.",
        fieldErrors: { websiteUrl: ["Enter a reachable public website URL."] },
      },
      { status: 422 },
    );
  }

  const db = getDb();
  const fingerprint = requestFingerprint(request);

  if (fingerprint) {
    const windowStart = new Date(Date.now() - 15 * 60 * 1_000);
    const recentCount = await db.submission.count({
      where: {
        requestFingerprint: fingerprint,
        createdAt: { gte: windowStart },
      },
    });

    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "Too many assessments. Try again in a few minutes." },
        { status: 429, headers: { "Retry-After": "900" } },
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
    await runFixturePipeline(submission.id);
  });

  return NextResponse.json(
    {
      assessmentId: submission.id,
      status: submission.status,
      statusUrl: `/api/assessments/${submission.id}`,
      processingUrl: `/assessment/${submission.id}/processing`,
    },
    { status: 202 },
  );
}
