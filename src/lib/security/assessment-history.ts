export const ASSESSMENT_HISTORY_COOKIE = "searchlight_assessments";
export const ASSESSMENT_HISTORY_LIMIT = 30;
export const ASSESSMENT_HISTORY_MAX_AGE = 60 * 60 * 24 * 365;

const ASSESSMENT_ID_PATTERN = /^c[a-z0-9]{20,31}$/;

export function parseAssessmentHistory(value: string | undefined) {
  if (!value || value.length > 2_048) return [];

  return [
    ...new Set(
      value
        .split(".")
        .map((id) => id.trim())
        .filter((id) => ASSESSMENT_ID_PATTERN.test(id)),
    ),
  ].slice(0, ASSESSMENT_HISTORY_LIMIT);
}

export function assessmentHistoryValue(
  currentValue: string | undefined,
  assessmentId: string,
) {
  if (!ASSESSMENT_ID_PATTERN.test(assessmentId)) {
    throw new Error("Cannot store an invalid assessment id.");
  }

  return [
    assessmentId,
    ...parseAssessmentHistory(currentValue).filter((id) => id !== assessmentId),
  ]
    .slice(0, ASSESSMENT_HISTORY_LIMIT)
    .join(".");
}
