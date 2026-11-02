import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
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
    return submission.programme.department.id === user.departmentId;
  }
  if (user.role === "PROGRAMME_COORDINATOR") {
    const assigned = await prisma.userProgramme.findUnique({
      where: {
        userId_programmeId: {
          userId: user.id,
          programmeId: submission.programme.id,
        },
      },
      select: { id: true },
    });
    return Boolean(assigned);
  }
  if (user.role === "DEAN") {
    return submission.programme.department.schoolId === user.schoolId;
  }
  return false;
}

/**
 * Check if the user can write to a submission (content, courses, images, submit draft).
 * HOD: own department only, editable statuses only.
 * Programme Coordinator: assigned programme(s) only, editable statuses only.
 * DEAN: same school, editable statuses only.
 * SUPER_ADMIN: unrestricted. ADMIN: no direct edits (review-only in product).
 */
export async function canWriteSubmission(
  user: ApiUser,
  submissionId: string,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "ADMIN") return false;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      programme: {
        select: {
          id: true,
          department: { select: { id: true, schoolId: true } },
        },
      },
    },
  });

  if (
    !submission ||
    !["DRAFT", "CORRECTIONS_REQUIRED"].includes(submission.status)
  ) {
    return false;
  }

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
