import { z } from "zod";

const shortText = z.string().trim().min(1).max(800);
const evidenceId = z.string().regex(/^[WSC]\d{3}$/);

export const aiSynthesisSchema = z
  .object({
    executiveSummary: z
      .object({
        overallAssessment: shortText,
        businessImplication: shortText,
      })
      .strict(),
    websiteFindings: z
      .array(
        z
          .object({
            evidenceId: z.string().regex(/^W\d{3}$/),
            title: z.string().trim().min(1).max(160),
            severity: z.enum(["high", "medium", "low"]),
            impact: shortText,
          })
          .strict(),
      )
      .max(3),
    selectedSerpEvidenceIds: z.array(z.string().regex(/^S\d{3}$/)).max(4),
    selectedCompetitorEvidenceIds: z.array(z.string().regex(/^C\d{3}$/)).max(3),
    recommendations: z
      .array(
        z
          .object({
            action: shortText,
            priority: z.enum(["high", "medium", "low"]),
            impact: shortText,
            effort: z.enum(["low", "medium", "high"]),
            evidenceRefs: z.array(evidenceId).min(1).max(5),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    nextSteps: z
      .object({
        days30: z.array(shortText).min(1).max(4),
        days60: z.array(shortText).min(1).max(4),
        days90: z.array(shortText).min(1).max(4),
      })
      .strict(),
  })
  .strict();

export const aiSynthesisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "websiteFindings",
    "selectedSerpEvidenceIds",
    "selectedCompetitorEvidenceIds",
    "recommendations",
    "nextSteps",
  ],
  properties: {
    executiveSummary: {
      type: "object",
      additionalProperties: false,
      required: ["overallAssessment", "businessImplication"],
      properties: {
        overallAssessment: { type: "string", description: "Evidence-grounded overall assessment without forecasts or invented metrics." },
        businessImplication: { type: "string", description: "A cautious business interpretation of the supplied evidence." },
      },
    },
    websiteFindings: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceId", "title", "severity", "impact"],
        properties: {
          evidenceId: { type: "string", description: "One supplied W-prefixed evidence ID." },
          title: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          impact: { type: "string", description: "Why the exact observation matters, stated without a guaranteed outcome." },
        },
      },
    },
    selectedSerpEvidenceIds: {
      type: "array",
      maxItems: 4,
      items: { type: "string", description: "One supplied S-prefixed evidence ID." },
    },
    selectedCompetitorEvidenceIds: {
      type: "array",
      maxItems: 3,
      items: { type: "string", description: "One supplied C-prefixed evidence ID." },
    },
    recommendations: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "priority", "impact", "effort", "evidenceRefs"],
        properties: {
          action: { type: "string", description: "A specific action supported by referenced findings." },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          impact: { type: "string", description: "Expected strategic relevance, without numerical or guaranteed outcomes." },
          effort: { type: "string", enum: ["low", "medium", "high"] },
          evidenceRefs: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string", description: "A selected W, S, or C finding ID." },
          },
        },
      },
    },
    nextSteps: {
      type: "object",
      additionalProperties: false,
      required: ["days30", "days60", "days90"],
      properties: {
        days30: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
        days60: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
        days90: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      },
    },
  },
} as const;
