import { z } from "zod";

function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const websiteSchema = z
  .string()
  .trim()
  .min(1, "Enter the website you want to analyze.")
  .max(2_048, "Website URL is too long.")
  .transform(normalizeWebsiteUrl)
  .pipe(
    z.url({
      protocol: /^https?$/,
      hostname: z.regexes.domain,
      error: "Enter a public website URL, such as https://example.com.",
    }),
  );

const targetKeywordsSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (!value) return [];
    const raw = Array.isArray(value) ? value : value.split(/[\n,]/);
    return [...new Set(raw.map((keyword) => keyword.trim()).filter(Boolean))];
  })
  .pipe(
    z
      .array(z.string().min(2).max(100))
      .max(8, "Use no more than 8 target keywords for one assessment."),
  );

export const assessmentInputSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters.")
    .max(120),
  websiteUrl: websiteSchema,
  industry: z.string().trim().min(2, "Enter the business industry.").max(100),
  location: z.string().trim().min(2, "Enter the target location.").max(120),
  primaryService: z
    .string()
    .trim()
    .min(2, "Enter the primary service or product.")
    .max(160),
  mainGoal: z
    .string()
    .trim()
    .min(10, "Describe the goal in at least 10 characters.")
    .max(500),
  targetKeywords: targetKeywordsSchema,
});

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

export function normalizedDomain(websiteUrl: string) {
  return new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, "");
}
