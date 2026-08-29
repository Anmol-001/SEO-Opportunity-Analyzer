import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured.", code: "CONFIGURATION_REQUIRED" },
      { status: 503 },
    );
  }

  const { id } = await params;
  const assessment = await getDb().submission.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      websiteUrl: true,
      primaryService: true,
      location: true,
      status: true,
      progressMessage: true,
      failureReason: true,
      warnings: true,
      opportunityScore: true,
      createdAt: true,
      completedAt: true,
      report: {
        select: {
          schemaVersion: true,
          opportunityScore: true,
          payload: true,
        },
      },
      siteScan: {
        select: {
          homepageUrl: true,
          sitemapUrl: true,
          warnings: true,
          robotsMetadata: true,
          pages: {
            orderBy: { createdAt: "asc" },
            select: {
              url: true,
              pageType: true,
              title: true,
              wordCount: true,
            },
          },
        },
      },
    },
  });

  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
  }

  return NextResponse.json(assessment);
}
