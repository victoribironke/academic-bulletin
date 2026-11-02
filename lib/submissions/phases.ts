/**
 * The 10 review phases a bulletin submission moves through, and the labels
 * used for submission statuses. One source of truth for every page and email.
 */
import type { SubmissionStatus } from "@prisma/client";

export const PHASES = [
  {
    number: 1,
    name: "Preparation & Departmental Review",
    short: "Dept Prep/Review",
  },
  { number: 2, name: "School Approval", short: "School" },
  { number: 3, name: "Academic Planning Review", short: "Academic Planning" },
  { number: 4, name: "Corrections", short: "Corrections" },
  { number: 5, name: "Final Consolidation", short: "Consolidation" },
  { number: 6, name: "Senate Approval", short: "Senate" },
  { number: 7, name: "Editing", short: "Editing" },
  { number: 8, name: "Typesetting", short: "Typesetting" },
  { number: 9, name: "Distribution", short: "Distribution" },
  { number: 10, name: "Post-Release", short: "Post-Release" },
] as const;

export const TOTAL_PHASES = PHASES.length;

/** Full phase names by number, e.g. PHASE_NAMES[2] === "School Approval". */
export const PHASE_NAMES: Record<number, string> = Object.fromEntries(
  PHASES.map((p) => [p.number, p.name]),
);

/** Short phase names for charts and tight spaces. */
export const PHASE_SHORT_NAMES: Record<number, string> = Object.fromEntries(
  PHASES.map((p) => [p.number, p.short]),
);

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  CORRECTIONS_REQUIRED: "Corrections Required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
