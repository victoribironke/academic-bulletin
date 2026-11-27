/**
 * Task G2, programme coordinators (R1). A Head of Department names a
 * programme coordinator for any programme in the department, mainly for the
 * 18 new programmes (work order section 6.3). The coordinator edits the
 * whole programme but cannot submit or recall it: only the Head does that
 * (lib/submissions/workflow.ts). Coordinators sign in with a babcock.edu.ng
 * Google account and the authenticator, like everyone else.
 *
 * A Head changes no one else's account: someone who already has another
 * role, or coordinates in another department, is DAP's to change. Taking a
 * coordinator off their last programme switches the account off; naming
 * them again switches it back on.
 */
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import type { ApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { getRoleDisplayName } from "@/lib/auth";
import { UNIVERSITY_DOMAIN, isUniversityEmail } from "@/lib/sign-in-access";
import { sendInvitation, type InvitationResult } from "@/lib/people/invitations";

/** G2: the roles a Head names per programme. */
export type ProgrammeRole = "PROGRAMME_COORDINATOR" | "COMMITTEE_MEMBER";
const ROLE_WORDS: Record<
  ProgrammeRole,
  { one: string; short: string; many: string; work: string; become: string; elsewhere: string; does: string; named: string; removed: string }
> = {
  PROGRAMME_COORDINATOR: {
    one: "programme coordinator",
    short: "coordinator",
    many: "coordinators",
    work: "draft",
    become: "coordinate a programme",
    elsewhere: "already coordinates programmes in",
    does: "They edit the whole programme; only the Head of Department submits it.",
    named: "COORDINATOR_NAMED",
    removed: "COORDINATOR_REMOVED",
  },
  COMMITTEE_MEMBER: {
    one: "committee member",
    short: "committee member",
    many: "committee members",
    work: "read and comment on",
    become: "be a committee member",
    elsewhere: "is already a committee member in",
    does: "They read and comment on the whole programme; they edit nothing.",
    named: "COMMITTEE_MEMBER_NAMED",
    removed: "COMMITTEE_MEMBER_REMOVED",
  },
};

export class CoordinatorError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type CoordinatorSummary = {
  id: string;
  name: string;
  email: string;
  invitedAt: string | null;
  signedIn: boolean;
};

export type DepartmentCoordinators = {
  department: { id: string; name: string };
  programmes: { id: string; code: string; name: string; isNew: boolean; coordinators: CoordinatorSummary[] }[];
};

const NAME_MAX = 60;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

function departmentOf(head: ApiUser): string {
  if (head.role !== "HOD" || !head.departmentId) {
    throw new CoordinatorError("Only a Head of Department names programme coordinators.", 403);
  }
  return head.departmentId;
}

const cleanName = (value: unknown) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, NAME_MAX) : "");

/** The department's programmes (new ones first) and who coordinates each. */
export async function coordinatorsFor(head: ApiUser, role: ProgrammeRole = "PROGRAMME_COORDINATOR"): Promise<DepartmentCoordinators> {
  const departmentId = departmentOf(head);
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true } });
  if (!department) throw new CoordinatorError("Your department isn't on the platform.", 404);
  const programmes = await prisma.programme.findMany({
    where: { departmentId, isHidden: false },
    select: {
      id: true,
      code: true,
      name: true,
      isNew: true,
      userAssignments: {
        where: { user: { role, isActive: true } },
        select: { user: { select: { id: true, firstName: true, lastName: true, email: true, invitedAt: true, firstSignInAt: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ isNew: "desc" }, { name: "asc" }],
  });
  return {
    department,
    programmes: programmes.map(({ userAssignments, ...programme }) => ({
      ...programme,
      coordinators: userAssignments.map(({ user }) => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        invitedAt: user.invitedAt?.toISOString() ?? null,
        signedIn: Boolean(user.firstSignInAt),
      })),
    })),
  };
}

export type NamedCoordinator = {
  userId: string;
  name: string;
  created: boolean;
  programmes: string[];
  invitation: InvitationResult | null;
};

/**
 * Names someone coordinator of one or more of the Head's programmes: a new
 * account, or more programmes for one of the department's coordinators.
 * A new (or switched-back-on, or never-invited) coordinator is invited.
 */
export async function nameCoordinator(
  head: ApiUser,
  input: Record<string, unknown>,
  role: ProgrammeRole = "PROGRAMME_COORDINATOR",
): Promise<NamedCoordinator> {
  const words = ROLE_WORDS[role];
  const departmentId = departmentOf(head);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || !isUniversityEmail(email)) {
    throw new CoordinatorError(`Use their ${UNIVERSITY_DOMAIN} address: ${words.many} sign in with it.`);
  }
  if (email === head.email.trim().toLowerCase()) {
    throw new CoordinatorError("You already draft and submit every programme in your department.");
  }
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  if (!firstName || !lastName) throw new CoordinatorError(`Give the ${words.short}'s first and last names.`);
  const programmeIds = Array.isArray(input.programmeIds)
    ? [...new Set(input.programmeIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  if (programmeIds.length === 0) throw new CoordinatorError(`Choose at least one programme for them to ${words.work}.`);
  const programmes = await prisma.programme.findMany({
    where: { id: { in: programmeIds }, departmentId, isHidden: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (programmes.length !== programmeIds.length) {
    throw new CoordinatorError("Choose programmes in your own department.", 403);
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      role: true,
      departmentId: true,
      isActive: true,
      invitedAt: true,
      firstName: true,
      lastName: true,
      department: { select: { name: true } },
    },
  });
  if (existing && existing.role !== role) {
    throw new CoordinatorError(
      `${email} already has an account as ${getRoleDisplayName(existing.role)}. Ask DAP if they should ${words.become} instead.`,
      409,
    );
  }
  if (existing && existing.departmentId !== departmentId) {
    throw new CoordinatorError(
      `${email} ${words.elsewhere} ${existing.department?.name ?? "another department"}. Ask DAP to move them.`,
      409,
    );
  }

  const department = await prisma.department.findUniqueOrThrow({ where: { id: departmentId }, select: { schoolId: true } });
  const userId = existing?.id ?? randomUUID();
  const name = existing ? `${existing.firstName} ${existing.lastName}` : `${firstName} ${lastName}`;
  const programmeNames = programmes.map((programme) => programme.name);
  await prisma.$transaction(async (tx) => {
    if (existing) {
      if (!existing.isActive) await tx.user.update({ where: { id: userId }, data: { isActive: true } });
      await tx.userProgramme.createMany({
        data: programmeIds.map((programmeId) => ({ userId, programmeId })),
        skipDuplicates: true,
      });
    } else {
      await tx.user.create({
        data: {
          id: userId,
          email,
          firstName,
          lastName,
          role,
          schoolId: department.schoolId,
          departmentId,
          programmeAssignments: { create: programmeIds.map((programmeId) => ({ programmeId })) },
        },
      });
    }
    await recordActivity(
      {
        actorId: head.id,
        action: words.named,
        entityType: "USER",
        entityId: userId,
        description: `Named ${name} (${email}) ${words.one} for ${programmeNames.join(", ")}. ${words.does}`,
        metadata: { email, programmeIds, created: !existing, switchedOn: Boolean(existing && !existing.isActive) },
      },
      tx,
    );
  });

  const invite = !existing || !existing.isActive || !existing.invitedAt;
  return {
    userId,
    name,
    created: !existing,
    programmes: programmeNames,
    invitation: invite ? await sendInvitation(userId) : null,
  };
}

/**
 * Takes a coordinator off one programme. With no programme left, their
 * account is switched off until they are named again.
 */
export async function removeCoordinator(head: ApiUser, userId: string, programme: unknown, role: ProgrammeRole = "PROGRAMME_COORDINATOR") {
  const words = ROLE_WORDS[role];
  const departmentId = departmentOf(head);
  const programmeId = typeof programme === "string" ? programme : "";
  const assignment = await prisma.userProgramme.findFirst({
    where: {
      userId,
      programmeId,
      programme: { departmentId },
      user: { role, departmentId },
    },
    select: { id: true, programme: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
  });
  if (!assignment) throw new CoordinatorError(`That person is no longer a ${words.one} of that programme.`, 404);
  const name = `${assignment.user.firstName} ${assignment.user.lastName}`;
  return prisma.$transaction(async (tx) => {
    await tx.userProgramme.delete({ where: { id: assignment.id } });
    const remaining = await tx.userProgramme.count({ where: { userId } });
    if (remaining === 0) await tx.user.update({ where: { id: userId }, data: { isActive: false } });
    await recordActivity(
      {
        actorId: head.id,
        action: words.removed,
        entityType: "USER",
        entityId: userId,
        description: `Took ${name} off ${assignment.programme.name} as ${words.one}.${remaining === 0 ? " With no other programme, their account is switched off." : ""}`,
        metadata: { programmeId, switchedOff: remaining === 0 },
      },
      tx,
    );
    return { name, programme: assignment.programme.name, switchedOff: remaining === 0 };
  });
}
