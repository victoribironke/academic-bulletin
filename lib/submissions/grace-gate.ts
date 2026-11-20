/**
 * The GRACE gate on approvals. Submit already refuses a bulletin whose GRACE
 * results haven't passed; this stops a reviewer approving one on, too, so no
 * bulletin reaches the next phase with a failing or out-of-date result. That
 * covers bulletins that reached review before Submit checked, and any whose
 * text changed after its last check.
 *
 * The only way past is an override by a role in GRACE_OVERRIDE_ROLES, with a
 * written reason. The ledger row for the approval keeps the reason and the
 * results it covered, so every exception stays on record.
 */
import type { UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  GRACE_OVERRIDE_REASON_LENGTH,
  GRACE_OVERRIDE_ROLES,
  GRACE_SUBMISSION_REQUIRED,
} from "@/lib/grace-config";
import {
  type CourseGraceBlockers,
  describeCourseGraceBlockers,
  getCourseGraceBlockers,
  hasCourseGraceBlockers,
} from "@/lib/courses/grace-compliance";
import {
  type SubmitReadinessContent,
  philosophyGraceIsCurrent,
} from "@/lib/submissions/submit-readiness";
import { cleanText } from "@/lib/bulletin/document-utils";

export const PHILOSOPHY_GRACE_MESSAGE =
  "The programme philosophy hasn't passed GRACE in its current wording.";

export type GraceGate = {
  blocked: boolean;
  /** Course descriptions without a current pass, by state. */
  courses: CourseGraceBlockers;
  /** The philosophy has text but no GRACE pass for that text. */
  philosophy: boolean;
  /** One line per problem, for people. */
  issues: string[];
};

/** What the review page needs to show the gate before anyone presses Approve. */
export type GraceGateSummary = {
  blocked: boolean;
  issues: string[];
  /** The person looking may approve past it with a logged override. */
  canOverride: boolean;
};

/** What an override keeps in the ledger: the reason and what it covered. */
export type GraceOverrideRecord = {
  reason: string;
  issues: string[];
  courses: Partial<CourseGraceBlockers>;
  philosophy: boolean;
};

export type GraceOverrideDecision =
  | { ok: true; override: GraceOverrideRecord | null }
  | {
      ok: false;
      status: 400 | 403 | 409;
      code:
        | "GRACE_APPROVAL_BLOCKED"
        | "GRACE_OVERRIDE_NOT_ALLOWED"
        | "GRACE_OVERRIDE_REASON_REQUIRED";
      error: string;
    };

export function canOverrideGrace(role: UserRole): boolean {
  return GRACE_OVERRIDE_ROLES.includes(role);
}

/** Same rule as Submit: a philosophy with text needs a pass for that text. */
export function philosophyNeedsGrace(content: SubmitReadinessContent): boolean {
  if (!GRACE_SUBMISSION_REQUIRED) return false;
  if (!cleanText(content?.philosophy ?? undefined)) return false;
  return !philosophyGraceIsCurrent(content);
}

export function buildGraceGate(
  courses: CourseGraceBlockers,
  content: SubmitReadinessContent,
): GraceGate {
  const philosophy = philosophyNeedsGrace(content);
  const issues = [
    ...(philosophy ? [PHILOSOPHY_GRACE_MESSAGE] : []),
    ...describeCourseGraceBlockers(courses),
  ];
  return {
    blocked: philosophy || hasCourseGraceBlockers(courses),
    courses,
    philosophy,
    issues,
  };
}

export async function getGraceGate(submissionId: string): Promise<GraceGate> {
  const [courses, content] = await Promise.all([
    getCourseGraceBlockers(submissionId),
    prisma.submissionContent.findUnique({
      where: { submissionId },
      select: {
        philosophy: true,
        philosophyGracePass: true,
        philosophyGrace: true,
        minimumDuration: true,
        minimumCGPA: true,
        totalUnits: true,
      },
    }),
  ]);
  return buildGraceGate(courses, content);
}

/** The override as the request sent it: a reason, or nothing. */
export function readGraceOverride(body: unknown): { reason: string } | null {
  const value = (body as { graceOverride?: unknown } | null)?.graceOverride;
  if (!value || typeof value !== "object") return null;
  const reason = (value as { reason?: unknown }).reason;
  return { reason: typeof reason === "string" ? reason.trim() : "" };
}

/**
 * Whether an approval may go ahead. Without blockers it always may, and an
 * override sent anyway is not recorded. With blockers, only a role in
 * GRACE_OVERRIDE_ROLES with a reason of the right length gets past.
 */
export function decideGraceApproval(input: {
  role: UserRole;
  gate: GraceGate;
  override: { reason: string } | null;
}): GraceOverrideDecision {
  const { role, gate, override } = input;
  if (!gate.blocked) return { ok: true, override: null };

  if (!override) {
    return {
      ok: false,
      status: 409,
      code: "GRACE_APPROVAL_BLOCKED",
      error:
        "Some GRACE results haven't passed for the text as it stands, so this bulletin can't move on yet.",
    };
  }
  if (!canOverrideGrace(role)) {
    return {
      ok: false,
      status: 403,
      code: "GRACE_OVERRIDE_NOT_ALLOWED",
      error:
        "Only a Super Administrator can approve a bulletin past GRACE results that haven't passed.",
    };
  }
  const { min, max } = GRACE_OVERRIDE_REASON_LENGTH;
  if (override.reason.length < min || override.reason.length > max) {
    return {
      ok: false,
      status: 400,
      code: "GRACE_OVERRIDE_REASON_REQUIRED",
      error: `Give the reason for the override in ${min} to ${max} characters.`,
    };
  }

  const courses = Object.fromEntries(
    Object.entries(gate.courses).filter(([, codes]) => codes.length > 0),
  ) as Partial<CourseGraceBlockers>;
  return {
    ok: true,
    override: {
      reason: override.reason,
      issues: gate.issues,
      courses,
      philosophy: gate.philosophy,
    },
  };
}

export function summarizeGraceGate(gate: GraceGate, role: UserRole): GraceGateSummary {
  return {
    blocked: gate.blocked,
    issues: gate.issues,
    canOverride: gate.blocked && canOverrideGrace(role),
  };
}
