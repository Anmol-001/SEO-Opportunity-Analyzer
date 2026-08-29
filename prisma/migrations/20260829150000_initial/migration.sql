-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'scanning', 'researching', 'ranking', 'competitors', 'keywords', 'generating', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "CompetitorType" AS ENUM ('direct', 'directory', 'publisher', 'platform', 'other');

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('existing', 'potential');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ProbeStatus" AS ENUM ('queued', 'complete', 'failed');

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "primaryService" TEXT NOT NULL,
    "mainGoal" TEXT NOT NULL,
    "targetKeywords" TEXT[],
    "status" "SubmissionStatus" NOT NULL DEFAULT 'pending',
    "progressMessage" TEXT,
    "failureReason" TEXT,
    "warnings" JSONB,
    "requestFingerprint" TEXT,
    "opportunityScore" INTEGER,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteScan" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "robotsMetadata" JSONB,
    "sitemapUrl" TEXT,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageScan" (
    "id" TEXT NOT NULL,
    "siteScanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageType" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1" TEXT,
    "h2s" TEXT[],
    "mainText" TEXT,
    "wordCount" INTEGER,
    "internalLinks" JSONB,
    "imageAlts" TEXT[],
    "canonicalUrl" TEXT,
    "structuredData" JSONB,
    "robotsDirectives" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "searchLocation" TEXT NOT NULL,
    "position" INTEGER,
    "url" TEXT,
    "domain" TEXT,
    "title" TEXT,
    "snippet" TEXT,
    "resultType" TEXT NOT NULL,
    "serpFeatures" JSONB,
    "submittedSiteHit" BOOLEAN NOT NULL DEFAULT false,
    "rawProviderRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerpResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "cluster" TEXT,
    "intent" TEXT,
    "searchVolume" INTEGER,
    "cpc" DECIMAL(10,2),
    "paidCompetitionSignal" DOUBLE PRECISION,
    "monthlyTrend" JSONB,
    "rankingPosition" INTEGER,
    "rankingUrl" TEXT,
    "competitorFrequency" INTEGER NOT NULL DEFAULT 0,
    "websiteRelevance" DOUBLE PRECISION,
    "contentCoverage" DOUBLE PRECISION,
    "keywordPriority" INTEGER,
    "opportunityType" "OpportunityType",
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "type" "CompetitorType" NOT NULL DEFAULT 'other',
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "rankingUrls" TEXT[],
    "positioning" TEXT,
    "strengths" JSONB,
    "gap" JSONB,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "opportunityScore" INTEGER NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "destinationHost" TEXT,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "responseStatus" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureProbe" (
    "id" TEXT NOT NULL,
    "status" "ProbeStatus" NOT NULL DEFAULT 'queued',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "InfrastructureProbe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "Submission_requestFingerprint_createdAt_idx" ON "Submission"("requestFingerprint", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteScan_submissionId_key" ON "SiteScan"("submissionId");

-- CreateIndex
CREATE INDEX "PageScan_siteScanId_idx" ON "PageScan"("siteScanId");

-- CreateIndex
CREATE UNIQUE INDEX "PageScan_siteScanId_url_key" ON "PageScan"("siteScanId", "url");

-- CreateIndex
CREATE INDEX "SerpResult_submissionId_keyword_idx" ON "SerpResult"("submissionId", "keyword");

-- CreateIndex
CREATE INDEX "SerpResult_submissionId_domain_idx" ON "SerpResult"("submissionId", "domain");

-- CreateIndex
CREATE INDEX "Keyword_submissionId_keywordPriority_idx" ON "Keyword"("submissionId", "keywordPriority");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_submissionId_keyword_key" ON "Keyword"("submissionId", "keyword");

-- CreateIndex
CREATE INDEX "Competitor_submissionId_occurrenceCount_idx" ON "Competitor"("submissionId", "occurrenceCount");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_submissionId_domain_key" ON "Competitor"("submissionId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "Report_submissionId_key" ON "Report"("submissionId");

-- CreateIndex
CREATE INDEX "WebhookEvent_submissionId_createdAt_idx" ON "WebhookEvent"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteScan" ADD CONSTRAINT "SiteScan_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageScan" ADD CONSTRAINT "PageScan_siteScanId_fkey" FOREIGN KEY ("siteScanId") REFERENCES "SiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpResult" ADD CONSTRAINT "SerpResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
