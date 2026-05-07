import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export interface ApiUser {
  id: string;
  role: string;
  departmentId: string | null;
  schoolId: string | null;
}

export async function getApiUser(): Promise<ApiUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, departmentId: true, schoolId: true },
    });

    return dbUser;
  } catch {
    return null;
  }
}

/**
 * Check if the user can write to a submission (content, courses, images, submit draft).
 * HOD: own department only, DRAFT only. DEAN: same school, DRAFT only.
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
          department: { select: { id: true, schoolId: true } },
        },
      },
    },
  });

  if (!submission || submission.status !== "DRAFT") return false;

  if (user.role === "HOD") {
    return submission.programme.department.id === user.departmentId;
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
