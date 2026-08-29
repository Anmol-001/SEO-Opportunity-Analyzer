import type { AiSynthesisOutput, SynthesisEvidencePacket } from "./types.ts";

export class EvidencePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidencePolicyError";
  }
}

function unique(values: string[]) {
  return new Set(values).size === values.length;
}

function containsUnsupportedPromise(value: string) {
  return (
    /\b\d+(?:\.\d+)?\s*%/i.test(value) ||
    /[$€£₹]\s*\d/i.test(value) ||
    /\b(?:guarantee(?:d|s)?|ensure(?:d|s)?)\b/i.test(value) ||
    /\bwill\b.{0,60}\b(?:increase|boost|grow|improve|rank|traffic|conversion|revenue|leads?)\b/i.test(
      value,
    )
  );
}

function narrativeStrings(output: AiSynthesisOutput) {
  return [
    output.executiveSummary.overallAssessment,
    output.executiveSummary.businessImplication,
    ...output.websiteFindings.flatMap((finding) => [finding.title, finding.impact]),
    ...output.recommendations.flatMap((recommendation) => [
      recommendation.action,
      recommendation.impact,
    ]),
    ...output.nextSteps.days30,
    ...output.nextSteps.days60,
    ...output.nextSteps.days90,
  ];
}

export function assertEvidencePolicy(
  output: AiSynthesisOutput,
  packet: SynthesisEvidencePacket,
) {
  const websiteIds = new Set(packet.website.map((item) => item.id));
  const serpIds = new Set(packet.serp.map((item) => item.id));
  const competitorIds = new Set(packet.competitors.map((item) => item.id));
  const selectedWebsiteIds = output.websiteFindings.map(
    (finding) => finding.evidenceId,
  );

  if (
    !unique(selectedWebsiteIds) ||
    !unique(output.selectedSerpEvidenceIds) ||
    !unique(output.selectedCompetitorEvidenceIds)
  ) {
    throw new EvidencePolicyError("Gemini selected duplicate evidence IDs.");
  }
  if (selectedWebsiteIds.some((id) => !websiteIds.has(id))) {
    throw new EvidencePolicyError("Gemini referenced unknown website evidence.");
  }
  if (output.selectedSerpEvidenceIds.some((id) => !serpIds.has(id))) {
    throw new EvidencePolicyError("Gemini referenced unknown SERP evidence.");
  }
  if (output.selectedCompetitorEvidenceIds.some((id) => !competitorIds.has(id))) {
    throw new EvidencePolicyError("Gemini referenced unknown competitor evidence.");
  }

  const selectedIds = new Set([
    ...selectedWebsiteIds,
    ...output.selectedSerpEvidenceIds,
    ...output.selectedCompetitorEvidenceIds,
  ]);
  if (selectedIds.size === 0) {
    throw new EvidencePolicyError("Gemini did not select any collected evidence.");
  }
  for (const recommendation of output.recommendations) {
    if (!unique(recommendation.evidenceRefs)) {
      throw new EvidencePolicyError("A Gemini recommendation repeated an evidence ID.");
    }
    if (recommendation.evidenceRefs.some((id) => !selectedIds.has(id))) {
      throw new EvidencePolicyError(
        "A Gemini recommendation referenced evidence absent from the report.",
      );
    }
  }
  if (narrativeStrings(output).some(containsUnsupportedPromise)) {
    throw new EvidencePolicyError(
      "Gemini output included an unsupported forecast, guarantee, or invented metric.",
    );
  }
}
