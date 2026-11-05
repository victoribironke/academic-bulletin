import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
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

export async function getApiUser(options?: {
  includeInactive?: boolean;
}): Promise<ApiUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
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
      },
    });

    if (!dbUser || (!dbUser.isActive && !options?.includeInactive)) {
      return null;
    }

    const { programmeAssignments, ...profile } = dbUser;
    return {
      ...profile,
      programmeIds: programmeAssignments.map(
        (assignment) => assignment.programmeId,
      ),
    };
  } catch {
    return null;
  }
}

export async function requireApiUser(
  allowedRoles?: UserRole[],
): Promise<AuthGate> {
  const user = await getApiUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

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
