import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import type { OpportunityScoringResult } from "@/lib/scoring/types";
import { buildSynthesisEvidencePacket } from "./evidence-packet";
import { createGeminiProviderFromEnv, type GeminiProvider } from "./gemini";
import {
  buildAiOpportunityReport,
  buildDeterministicOpportunityReport,
} from "./report-builder";
import type { SynthesisSource } from "./types";

function normalizeWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((warning): warning is string => typeof warning === "string")
    : [];
}

function mergeWarnings(...groups: string[][]) {
  return [...new Set(groups.flat().map((warning) => warning.slice(0, 500)))];
}

async function persistSynthesisWarning(submissionId: string, warning: string) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: { warnings: true },
  });
  if (!submission) return;
  const warnings = mergeWarnings(normalizeWarnings(submission.warnings), [warning]);
  await db.submission.update({
    where: { id: submissionId },
    data: { warnings: warnings as Prisma.InputJsonValue },
  });
}

export interface SynthesisDependencies {
  provider?: Pick<GeminiProvider, "model" | "synthesize"> | null;
}

export async function synthesizeSubmissionReport(
  submissionId: string,
  scoring: OpportunityScoringResult,
  dependencies: SynthesisDependencies = {},
) {
  const db = getDb();
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      businessName: true,
      industry: true,
      location: true,
      mainGoal: true,
      primaryService: true,
      websiteUrl: true,
      siteScan: {
        select: {
          pages: {
            orderBy: { createdAt: "asc" },
            select: {
              h1: true,
              h2s: true,
              pageType: true,
              structuredData: true,
              title: true,
              url: true,
              wordCount: true,
            },
          },
        },
      },
      keywords: {
        orderBy: { keyword: "asc" },
        select: {
          competitorFrequency: true,
          evidence: true,
          intent: true,
          keyword: true,
          paidCompetitionSignal: true,
          rankingPosition: true,
          searchVolume: true,
        },
      },
      competitors: {
        orderBy: [{ occurrenceCount: "desc" }, { domain: "asc" }],
        select: {
          domain: true,
          evidence: true,
          gap: true,
          occurrenceCount: true,
          positioning: true,
          strengths: true,
          type: true,
        },
      },
    },
  });
  if (!submission) throw new Error("Submission not found for report synthesis.");

  const source: SynthesisSource = {
    businessName: submission.businessName,
    competitors: submission.competitors.map((competitor) => ({
      ...competitor,
      type: competitor.type,
    })),
    industry: submission.industry,
    keywords: submission.keywords,
    location: submission.location,
    mainGoal: submission.mainGoal,
    pages: submission.siteScan?.pages ?? [],
    primaryService: submission.primaryService,
    websiteUrl: submission.websiteUrl,
  };
  const packet = buildSynthesisEvidencePacket(source, scoring);
  const hasEvidence =
    packet.website.length + packet.serp.length + packet.competitors.length > 0;
  if (!hasEvidence) {
    const warning =
      "AI synthesis unavailable: insufficient collected evidence; deterministic fallback used.";
    await persistSynthesisWarning(submissionId, warning);
    return {
      aiUsed: false,
      report: buildDeterministicOpportunityReport({
        packet,
        reason: "insufficient_evidence",
        scoring,
        source,
      }),
      warning,
    };
  }

  const provider =
    dependencies.provider === undefined
      ? createGeminiProviderFromEnv()
      : dependencies.provider;
  if (!provider) {
    const warning =
      "AI synthesis unavailable: GEMINI_API_KEY is not configured; deterministic fallback used.";
    await persistSynthesisWarning(submissionId, warning);
    return {
      aiUsed: false,
      report: buildDeterministicOpportunityReport({
        packet,
        reason: "missing_key",
        scoring,
        source,
      }),
      warning,
    };
  }

  try {
    const output = await provider.synthesize(packet);
    return {
      aiUsed: true,
      report: buildAiOpportunityReport({
        model: provider.model,
        output,
        packet,
        scoring,
        source,
      }),
      warning: null,
    };
  } catch {
    const warning =
      "AI synthesis unavailable: Gemini failed or returned evidence that did not pass validation; deterministic fallback used.";
    await persistSynthesisWarning(submissionId, warning);
    return {
      aiUsed: false,
      report: buildDeterministicOpportunityReport({
        packet,
        reason: "provider_failure",
        scoring,
        source,
      }),
      warning,
    };
  }
}
