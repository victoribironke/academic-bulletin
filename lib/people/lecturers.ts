/**
 * Task G2, lecturers. A Head of Department adds the department's lecturers
 * by their babcock.edu.ng address and gives them courses (lib/courses/
 * assignments.ts). A lecturer sees only those courses. Taking a lecturer
 * off switches the account off and gives their courses back to the Head;
 * what they wrote stays on the courses.
 */
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import type { ApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { getRoleDisplayName } from "@/lib/auth";
import { UNIVERSITY_DOMAIN, isUniversityEmail } from "@/lib/sign-in-access";
import { sendInvitation, type InvitationResult } from "@/lib/people/invitations";
import { CoordinatorError } from "@/lib/people/coordinators";

const NAME_MAX = 60;
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const cleanName = (value: unknown) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, NAME_MAX) : "");

function departmentOf(head: ApiUser): string {
  if (head.role !== "HOD" || !head.departmentId) throw new CoordinatorError("Only a Head of Department adds lecturers.", 403);
  return head.departmentId;
}

export async function lecturersFor(head: ApiUser) {
  const departmentId = departmentOf(head);
  const lecturers = await prisma.user.findMany({
    where: { role: "LECTURER", isActive: true, departmentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      invitedAt: true,
      firstSignInAt: true,
      _count: { select: { lecturerAssignments: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return {
    lecturers: lecturers.map((lecturer) => ({
      id: lecturer.id,
      name: `${lecturer.firstName} ${lecturer.lastName}`.trim(),
      email: lecturer.email,
      invitedAt: lecturer.invitedAt?.toISOString() ?? null,
      signedIn: Boolean(lecturer.firstSignInAt),
      courses: lecturer._count.lecturerAssignments,
    })),
  };
}

export async function nameLecturer(
  head: ApiUser,
  input: Record<string, unknown>,
): Promise<{ userId: string; name: string; created: boolean; invitation: InvitationResult | null }> {
  const departmentId = departmentOf(head);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || !isUniversityEmail(email)) {
    throw new CoordinatorError(`Use their ${UNIVERSITY_DOMAIN} address: they sign in with it.`);
  }
  if (email === head.email.trim().toLowerCase()) throw new CoordinatorError("You write any course yourself; add your lecturers here.");
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  if (!firstName || !lastName) throw new CoordinatorError("Give the lecturer's first and last names.");

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, role: true, departmentId: true, isActive: true, invitedAt: true, firstName: true, lastName: true, department: { select: { name: true } } },
  });
  if (existing && existing.role !== "LECTURER") {
    throw new CoordinatorError(`${email} already has an account as ${getRoleDisplayName(existing.role)}. Ask DAP if they should be a lecturer instead.`, 409);
  }
  if (existing && existing.departmentId !== departmentId) {
    throw new CoordinatorError(`${email} is a lecturer in ${existing.department?.name ?? "another department"}. Ask DAP to move them.`, 409);
  }
  const department = await prisma.department.findUniqueOrThrow({ where: { id: departmentId }, select: { schoolId: true } });
  const userId = existing?.id ?? randomUUID();
  const name = existing ? `${existing.firstName} ${existing.lastName}` : `${firstName} ${lastName}`;
  await prisma.$transaction(async (tx) => {
    if (existing) {
      if (!existing.isActive) await tx.user.update({ where: { id: userId }, data: { isActive: true } });
    } else {
      await tx.user.create({
        data: { id: userId, email, firstName, lastName, role: "LECTURER", schoolId: department.schoolId, departmentId },
      });
    }
    await recordActivity(
      {
        actorId: head.id,
        action: "LECTURER_NAMED",
        entityType: "USER",
        entityId: userId,
        description: `Added ${name} (${email}) as a lecturer. They see only the courses the Head gives them.`,
        metadata: { email, created: !existing, switchedOn: Boolean(existing && !existing.isActive) },
      },
      tx,
    );
  });
  const invite = !existing || !existing.isActive || !existing.invitedAt;
  return { userId, name, created: !existing, invitation: invite ? await sendInvitation(userId) : null };
}

export async function removeLecturer(head: ApiUser, userId: string) {
  const departmentId = departmentOf(head);
  const lecturer = await prisma.user.findFirst({
    where: { id: userId, role: "LECTURER", departmentId, isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!lecturer) throw new CoordinatorError("That person isn't one of your department's lecturers.", 404);
  const name = `${lecturer.firstName} ${lecturer.lastName}`;
  return prisma.$transaction(async (tx) => {
    const released = await tx.courseAssignment.deleteMany({ where: { lecturerId: userId } });
    await tx.user.update({ where: { id: userId }, data: { isActive: false } });
    await recordActivity(
      {
        actorId: head.id,
        action: "LECTURER_REMOVED",
        entityType: "USER",
        entityId: userId,
        description: `Took ${name} off as a lecturer; their account is switched off and their ${released.count} course${released.count === 1 ? "" : "s"} came back to the Head. What they wrote stays on the courses.`,
        metadata: { courses: released.count },
      },
      tx,
    );
    return { name, courses: released.count };
  });
}
