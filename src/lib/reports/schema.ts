import { z } from "zod";

const severitySchema = z.enum(["high", "medium", "low"]);
const prioritySchema = z.enum(["high", "medium", "low"]);
const conciseText = z.string().trim().min(1).max(1_000);

export const opportunityReportSchema = z
  .object({
    executiveSummary: z
      .object({
        overallAssessment: conciseText,
        businessImplication: conciseText,
      })
      .strict(),
    websiteFindings: z
      .array(
        z
          .object({
            id: z.string().regex(/^W\d{3}$/),
            title: z.string().trim().min(1).max(160),
            severity: severitySchema,
            evidence: conciseText,
            impact: conciseText,
          })
          .strict(),
      )
      .max(5),
    serpFindings: z
      .array(
        z
          .object({
            id: z.string().regex(/^S\d{3}$/),
            keyword: z.string().trim().min(1).max(160),
            intent: z.string().trim().min(1).max(80),
            serpCharacteristics: z.array(z.string().trim().min(1).max(80)).max(10),
            rankingPosition: z.number().int().positive().nullable(),
            evidence: conciseText,
          })
          .strict(),
      )
      .max(8),
    competitorFindings: z
      .array(
        z
          .object({
            id: z.string().regex(/^C\d{3}$/),
            domain: z.string().trim().min(1).max(253),
            type: z.string().trim().min(1).max(80),
            positioning: z.string().trim().max(500),
            strengths: z.array(z.string().trim().min(1).max(500)).max(10),
            gap: z.string().trim().max(1_000),
            evidence: conciseText,
          })
          .strict(),
      )
      .max(5),
    keywordOpportunities: z
      .array(
        z
          .object({
            keyword: z.string().trim().min(1).max(160),
            searchVolume: z.number().int().nonnegative().nullable(),
            paidCompetitionSignal: z.number().min(0).max(1).nullable(),
            rankingPosition: z.number().int().positive().nullable(),
            opportunityType: z.enum(["existing", "potential"]),
            priority: prioritySchema,
            rationale: conciseText,
          })
          .strict(),
      )
      .max(8),
    recommendations: z
      .array(
        z
          .object({
            id: z.string().regex(/^R\d{3}$/),
            action: conciseText,
            priority: prioritySchema,
            impact: conciseText,
            effort: z.enum(["low", "medium", "high"]),
            evidenceRefs: z
              .array(z.string().regex(/^[WSC]\d{3}$/))
              .min(1)
              .max(5),
          })
          .strict(),
      )
      .max(6),
    nextSteps: z
      .object({
        days30: z.array(conciseText).max(5),
        days60: z.array(conciseText).max(5),
        days90: z.array(conciseText).max(5),
      })
      .strict(),
    dataAvailability: z
      .object({
        website: z.boolean(),
        serp: z.boolean(),
        keywordMetrics: z.boolean(),
        aiSynthesis: z.boolean(),
        notes: z.array(conciseText).min(1).max(8),
      })
      .strict(),
  })
  .passthrough();
