import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  scanWebsite,
  type ScannerDependencies,
} from "@/lib/scanner/scan-website";

export async function scanAndPersistSubmission(
  submissionId: string,
  dependencies: ScannerDependencies = {},
) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      location: true,
      primaryService: true,
      websiteUrl: true,
    },
  });

  if (!submission) throw new Error("Submission not found for website scan.");

  const result = await scanWebsite(
    {
      location: submission.location,
      primaryService: submission.primaryService,
      websiteUrl: submission.websiteUrl,
    },
    dependencies,
  );

  await db.$transaction(async (transaction) => {
    const siteScan = await transaction.siteScan.upsert({
      where: { submissionId },
      create: {
        submissionId,
        homepageUrl: result.homepageUrl,
        robotsMetadata: result.robots as unknown as Prisma.InputJsonValue,
        sitemapUrl: result.sitemapUrl,
        warnings: result.warnings as Prisma.InputJsonValue,
      },
      update: {
        homepageUrl: result.homepageUrl,
        robotsMetadata: result.robots as unknown as Prisma.InputJsonValue,
        sitemapUrl: result.sitemapUrl,
        warnings: result.warnings as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await transaction.pageScan.deleteMany({ where: { siteScanId: siteScan.id } });

    for (const page of result.pages) {
      await transaction.pageScan.create({
        data: {
          siteScanId: siteScan.id,
          canonicalUrl: page.canonicalUrl,
          h1: page.h1,
          h2s: page.h2s,
          imageAlts: page.imageAlts,
          internalLinks: page.internalLinks as unknown as Prisma.InputJsonValue,
          mainText: page.mainText,
          metaDescription: page.metaDescription,
          pageType: page.pageType,
          robotsDirectives: page.robotsDirectives,
          structuredData: page.structuredData as Prisma.InputJsonValue,
          title: page.title,
          url: page.url,
          wordCount: page.wordCount,
        },
      });
    }

    await transaction.submission.update({
      where: { id: submissionId },
      data: { warnings: result.warnings as Prisma.InputJsonValue },
    });
  });

  return result;
}

export async function persistScanFailure(submissionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Website scan failed.";
  const warning = `Website analysis unavailable: ${message}`.slice(0, 500);
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: { websiteUrl: true },
  });
  if (!submission) return warning;

  await db.siteScan.upsert({
    where: { submissionId },
    create: {
      submissionId,
      homepageUrl: submission.websiteUrl,
      warnings: [warning],
    },
    update: {
      homepageUrl: submission.websiteUrl,
      warnings: [warning],
    },
  });
  await db.submission.update({
    where: { id: submissionId },
    data: { warnings: [warning] },
  });

  return warning;
}
