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
    const { data: { user } } = await supabase.auth.getUser();
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
 * Check if the user can write to a submission.
 * HODs can only write to their own department's submissions.
 */
export async function canWriteSubmission(
  user: ApiUser,
  submissionId: string,
): Promise<boolean> {
  if (["ADMIN", "SUPER_ADMIN"].includes(user.role)) return true;

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
