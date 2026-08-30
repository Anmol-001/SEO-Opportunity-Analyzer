export const assessmentFieldNames = [
  "businessName",
  "websiteUrl",
  "industry",
  "location",
  "primaryService",
  "mainGoal",
  "targetKeywords",
] as const;

export type AssessmentFieldName = (typeof assessmentFieldNames)[number];
export type AssessmentFieldErrors = Partial<
  Record<AssessmentFieldName, string[]>
>;

const assessmentFieldNameSet = new Set<string>(assessmentFieldNames);

export function isAssessmentFieldName(
  value: string,
): value is AssessmentFieldName {
  return assessmentFieldNameSet.has(value);
}

export function clearFieldError(
  errors: AssessmentFieldErrors,
  field: AssessmentFieldName,
) {
  if (!(field in errors)) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}
