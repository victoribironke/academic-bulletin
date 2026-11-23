/**
 * Rule W6: the Academic Policy's minimum CGPA to graduate is 2.00 on the
 * 5-point scale. A programme may set a higher figure (Nursing and Medicine
 * do), never a lower one.
 */
export const MINIMUM_CGPA_RANGE = { min: 2, max: 5 } as const;
export const UNIVERSITY_MINIMUM_CGPA = MINIMUM_CGPA_RANGE.min;

export function isValidMinimumCgpa(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MINIMUM_CGPA_RANGE.min &&
    value <= MINIMUM_CGPA_RANGE.max
  );
}

export function minimumCgpaRuleMessage(value: unknown): string {
  return `The minimum CGPA is ${String(value)}; it must be between ${MINIMUM_CGPA_RANGE.min.toFixed(2)} and ${MINIMUM_CGPA_RANGE.max.toFixed(2)} (Academic Policy: at least 2.00).`;
}
