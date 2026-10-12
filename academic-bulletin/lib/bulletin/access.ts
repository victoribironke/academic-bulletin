import prisma from "@/lib/prisma";
import {
  canAccessDepartment,
  canViewSubmission,
  isAdministrator,
  type ApiUser,
} from "@/lib/api-auth";

export async function canExportBulletin(
  user: ApiUser,
  scope: {
    level: string;
    submissionId?: string | null;
    programmeId?: string | null;
    departmentId?: string | null;
    schoolId?: string | null;
  },
): Promise<boolean> {
  if (scope.submissionId) {
    const submission = await prisma.submission.findUnique({
      where: { id: scope.submissionId },
      select: {
        programmeId: true,
        programme: { select: { departmentId: true } },
      },
    });

    if (!submission || !(await canViewSubmission(user, scope.submissionId))) {
      return false;
    }
    if (scope.programmeId && scope.programmeId !== submission.programmeId) {
      return false;
    }
    if (
      scope.departmentId &&
      scope.departmentId !== submission.programme.departmentId
    ) {
      return false;
    }
    return true;
  }

  if (scope.level === "institution") return isAdministrator(user);

  if (scope.level === "school") {
    return (
      isAdministrator(user) ||
      (user.role === "DEAN" && user.schoolId === scope.schoolId)
    );
  }

  if (scope.departmentId) {
    return canAccessDepartment(user, scope.departmentId);
  }

  if (scope.programmeId) {
    const programme = await prisma.programme.findUnique({
      where: { id: scope.programmeId },
      select: { departmentId: true },
    });
    return programme
      ? canAccessDepartment(user, programme.departmentId)
      : false;
  }

  return false;
}
