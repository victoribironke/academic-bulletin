/**
 * The 10 phases a bulletin moves through, and the labels used for submission
 * statuses. One source of truth for every page, email, chart and export.
 * Names follow the work order (task Q6); the numbers 1 to 10 never change,
 * so stored data and history stay valid.
 */
import type { SubmissionStatus } from "@prisma/client";

export const PHASES = [
  {
    number: 1,
    name: "Departmental Drafting",
    short: "Departmental Drafting",
    owner: "Head of Department, with lecturers",
  },
  { number: 2, name: "School Board Harmonisation", short: "School Board", owner: "Dean" },
  { number: 3, name: "Academic Planning Vetting", short: "DAP Vetting", owner: "DAP" },
  { number: 4, name: "Departmental Revision", short: "Revision", owner: "Head of Department" },
  {
    number: 5,
    name: "Consolidation and Sign-off",
    short: "Consolidation",
    owner: "DAP, with Head and Dean sign-off",
  },
  { number: 6, name: "Senate Approval", short: "Senate Approval", owner: "Senate (DAP records)" },
  { number: 7, name: "Copy-Editing", short: "Copy-Editing", owner: "Babcock Press" },
  { number: 8, name: "Typesetting and Proofs", short: "Typesetting", owner: "Babcock Press" },
  { number: 9, name: "Digital Publication", short: "Publication", owner: "Babcock Press" },
  {
    number: 10,
    name: "Errata and Archiving",
    short: "Errata and Archive",
    owner: "Babcock Press, corrections approved by DAP",
  },
] as const;

export const TOTAL_PHASES = PHASES.length;

/** Full phase names by number, e.g. PHASE_NAMES[2] === "School Board Harmonisation". */
export const PHASE_NAMES: Record<number, string> = Object.fromEntries(
  PHASES.map((p) => [p.number, p.name]),
);

/** Short phase names for charts and tight spaces. */
export const PHASE_SHORT_NAMES: Record<number, string> = Object.fromEntries(
  PHASES.map((p) => [p.number, p.short]),
);

/**
 * Evidence a phase needs before it can be approved, by phase number. The
 * reference is stored on the transition that closes the phase.
 */
export const PHASE_REQUIRED_EVIDENCE: Record<number, string> = {
  6: "Senate minute reference",
};

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  CORRECTIONS_REQUIRED: "Revision requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** Who owns each phase, shown under each step. */
export const PHASE_OWNERS: Record<number, string> = Object.fromEntries(
  PHASES.map((p) => [p.number, p.owner]),
);

/** "Phase 3 of 10: Academic Planning Vetting". */
export function phaseHeading(phase: number): string {
  return `Phase ${phase} of ${TOTAL_PHASES}: ${PHASE_NAMES[phase] ?? ""}`.trim();
}

/** The button that sends a programme back to its department (Q6). */
export const REQUEST_REVISION_LABEL = "Request revision";

/** D5: the department takes a submitted programme back before the Dean opens it. */
export const RECALL_LABEL = "Recall from the Dean";

/**
 * The approve button names what it does (Q6): "Approve to DAP Vetting",
 * "Approve for Senate", rather than "Approve phase".
 */
export function approveActionLabel(currentPhase: number): string {
  if (currentPhase === 5) return "Approve for Senate";
  if (currentPhase === 6) return "Record Senate approval";
  if (currentPhase >= TOTAL_PHASES) return "Close the bulletin";
  return `Approve to ${PHASE_SHORT_NAMES[currentPhase + 1]}`;
}
