import { NextResponse } from "next/server";
import { getSessionAccess } from "@/auth";
import prisma from "@/lib/prisma";
import { currentVerification, mfaRequiredFor } from "@/lib/mfa/policy";
import { canEditSubmissionAtStage } from "@/lib/submissions/workflow";
import { isNamedPhaseOwner, loadPhaseOwners } from "@/lib/submissions/phase-owners";
import type { UserRole } from "@prisma/client";

export interface ApiUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  departmentId: string | null;
  schoolId: string | null;
  programmeIds: string[];
}

type AuthGate =
  | { ok: true; user: ApiUser }
  | { ok: false; response: NextResponse };

/** The response for an admin whose sign-in still needs an authenticator code. */
export const MFA_REQUIRED_RESPONSE = {
  error: "Enter the code from your authenticator app to continue.",
  code: "MFA_REQUIRED",
} as const;

/** How often "last active" is written for someone using the site. */
const LAST_ACTIVE_EVERY_MS = 15 * 60_000;

type ApiUserLookup =
  | { user: ApiUser }
  | { user: null; reason: "signed_out" | "mfa_required" };

/**
 * The signed-in user, from the database. An Academic Planning Admin or Super
 * Admin counts as signed in only once this sign-in has a valid two-step
 * check on record, so promoting someone, or a Super Admin resetting their
 * authenticator, takes effect on the very next request.
 */
export async function lookupApiUser(options?: {
  includeInactive?: boolean;
}): Promise<ApiUserLookup> {
  try {
    const access = await getSessionAccess();
    if (!access) return { user: null, reason: "signed_out" };
    if (access.mfa === "pending") return { user: null, reason: "mfa_required" };

    const dbUser = await prisma.user.findUnique({
      where: { id: access.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        departmentId: true,
        schoolId: true,
        programmeAssignments: {
          select: { programmeId: true },
        },
        mfaVerifications: currentVerification(access.sessionId),
        lastActiveAt: true,
      },
    });

    if (!dbUser || (!dbUser.isActive && !options?.includeInactive)) {
      return { user: null, reason: "signed_out" };
    }
    const { programmeAssignments, mfaVerifications, lastActiveAt, ...profile } = dbUser;
    // D3: last active, written at most every 15 minutes and never in the way.
    if (!lastActiveAt || Date.now() - lastActiveAt.getTime() > LAST_ACTIVE_EVERY_MS) {
      void prisma.user
        .update({ where: { id: profile.id }, data: { lastActiveAt: new Date() } })
        .catch((error) => console.error("Couldn't record activity time:", error));
    }
    if (mfaRequiredFor(profile.role) && mfaVerifications.length === 0) {
      return { user: null, reason: "mfa_required" };
    }

    return {
      user: {
        ...profile,
        programmeIds: programmeAssignments.map(
          (assignment) => assignment.programmeId,
        ),
      },
    };
  } catch {
    return { user: null, reason: "signed_out" };
  }
}

export async function getApiUser(options?: {
  includeInactive?: boolean;
}): Promise<ApiUser | null> {
  return (await lookupApiUser(options)).user;
}

export async function requireApiUser(
  allowedRoles?: UserRole[],
): Promise<AuthGate> {
  const lookup = await lookupApiUser();
  if (!lookup.user) {
    return {
      ok: false,
      response:
        lookup.reason === "mfa_required"
          ? NextResponse.json(MFA_REQUIRED_RESPONSE, { status: 401 })
          : NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const user = lookup.user;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

export function isAdministrator(user: ApiUser): boolean {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function canAccessDepartment(
  user: ApiUser,
  departmentId: string,
): Promise<boolean> {
  if (isAdministrator(user)) return true;
  if (
    user.role === "HOD" ||
    user.role === "PROGRAMME_COORDINATOR"
  ) {
    return user.departmentId === departmentId;
  }
  if (user.role !== "DEAN" || !user.schoolId) return false;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { schoolId: true },
  });
  return department?.schoolId === user.schoolId;
}

export async function canViewSubmission(
  user: ApiUser,
  submissionId: string,
): Promise<boolean> {
  if (isAdministrator(user)) return true;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      currentPhase: true,
      programme: {
        select: {
          id: true,
          department: { select: { id: true, schoolId: true } },
        },
      },
    },
  });
  if (!submission) return false;

  if (user.role === "HOD") {
    if (submission.programme.department.id === user.departmentId) return true;
  } else if (user.role === "PROGRAMME_COORDINATOR") {
    const assigned = await prisma.userProgramme.findUnique({
      where: {
        userId_programmeId: {
          userId: user.id,
          programmeId: submission.programme.id,
        },
      },
      select: { id: true },
    });
    if (assigned) return true;
  } else if (user.role === "DEAN") {
    if (submission.programme.department.schoolId === user.schoolId) return true;
  }

  // Someone named as owner of the bulletin's current phase sees every
  // bulletin at that phase, whatever their unit.
  return isNamedPhaseOwner(await loadPhaseOwners(), user.id, submission.currentPhase);
}

/**
 * Read-only access: everything `canViewSubmission` allows, plus HODs reading
 * other departments' bulletins in their own school (the Browse page). Use it
 * only on GET routes; comments, GRACE runs and edits keep `canViewSubmission`.
 */
export async function canReadSubmission(
  user: ApiUser,
  submissionId: string,
): Promise<boolean> {
  if (await canViewSubmission(user, submissionId)) return true;
  if (user.role !== "HOD" || !user.schoolId) return false;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { programme: { select: { department: { select: { schoolId: true } } } } },
  });
  return submission?.programme.department.schoolId === user.schoolId;
}

/** Read-only department access, with the same HOD school rule as above. */
export async function canReadDepartment(
  user: ApiUser,
  departmentId: string,
): Promise<boolean> {
  if (await canAccessDepartment(user, departmentId)) return true;
  if (user.role !== "HOD" || !user.schoolId) return false;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { schoolId: true },
  });
  return department?.schoolId === user.schoolId;
}

/**
 * Check if the user can write to a submission (content, courses, images, submit draft).
 * Editing follows the phase owners (department at phase 1, Dean at phase 2,
 * Academic Planning from phase 3 unless the phase_owners table says
 * otherwise). Super Admin is the recovery override. Unit/programme scope is
 * still enforced below for owners by role.
 */
export async function canWriteSubmission(
  user: ApiUser,
  submissionId: string,
): Promise<boolean> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      currentPhase: true,
      programme: {
        select: {
          id: true,
          department: { select: { id: true, schoolId: true } },
        },
      },
    },
  });

  if (!submission) {
    return false;
  }

  const owners = await loadPhaseOwners();
  if (
    !canEditSubmissionAtStage({
      role: user.role,
      userId: user.id,
      currentPhase: submission.currentPhase,
      currentStatus: submission.status,
      owners,
    })
  ) return false;

  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return true;
  if (isNamedPhaseOwner(owners, user.id, submission.currentPhase)) return true;

  if (user.role === "HOD") {
    return submission.programme.department.id === user.departmentId;
  }

  if (user.role === "PROGRAMME_COORDINATOR") {
    return user.programmeIds.includes(submission.programme.id);
  }

  if (user.role === "DEAN") {
    return submission.programme.department.schoolId === user.schoolId;
  }

  return false;
}

/** Enforce auth for mutating a submission; use in API routes (not GET). */
export async function requireSubmissionWriteAccess(
  user: ApiUser | null,
  submissionId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!user) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const allowed = await canWriteSubmission(user, submissionId);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      message: "You cannot edit this submission",
    };
  }
  return { ok: true };
}
