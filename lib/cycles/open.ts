/**
 * Opening the real cycle (work order task A3): "2027-2031 Bulletin
 * Development Cycle", active, with one draft for every programme a Head of
 * Department sees (hidden programmes, task B15, get none).
 *
 * The drafts start empty. Their course lists come from the E1 pre-fill
 * (scripts/prefill-course-structures.ts) and their calendar from the C1
 * loader (scripts/load-calendar.ts), run straight after.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { recordActivity } from "@/lib/activity-log";

type Database = PrismaClient;

export type OpenCyclePlan = {
  cycle: { id: string; name: string; isActive: boolean } | null;
  closing: { id: string; name: string }[];
  drafts: { programmeId: string; programmeCode: string; programmeName: string; isNew: boolean }[];
  alreadyDrafted: number;
  hidden: { code: string; name: string }[];
};

/** What opening the cycle would do; changes nothing. */
export async function planOpenCycle(db: Database, name: string): Promise<OpenCyclePlan> {
  const cycle = await db.reviewCycle.findFirst({
    where: { name },
    select: { id: true, name: true, isActive: true, archivedAt: true },
  });
  if (cycle?.archivedAt) throw new Error(`${name} is in the Archive; restore it first.`);
  const closing = await db.reviewCycle.findMany({
    where: { isActive: true, ...(cycle && { id: { not: cycle.id } }) },
    select: { id: true, name: true },
  });
  const programmes = await db.programme.findMany({
    select: { id: true, code: true, name: true, isNew: true, isHidden: true },
    orderBy: { code: "asc" },
  });
  const drafted = new Set(
    cycle
      ? (await db.submission.findMany({ where: { cycleId: cycle.id }, select: { programmeId: true } })).map(
          (draft) => draft.programmeId,
        )
      : [],
  );
  const visible = programmes.filter((programme) => !programme.isHidden);
  return {
    cycle: cycle && { id: cycle.id, name: cycle.name, isActive: cycle.isActive },
    closing,
    drafts: visible
      .filter((programme) => !drafted.has(programme.id))
      .map((programme) => ({
        programmeId: programme.id,
        programmeCode: programme.code,
        programmeName: programme.name,
        isNew: programme.isNew,
      })),
    alreadyDrafted: visible.filter((programme) => drafted.has(programme.id)).length,
    hidden: programmes.filter((programme) => programme.isHidden).map(({ code, name: label }) => ({ code, name: label })),
  };
}

/**
 * Creates (or reopens) the cycle, closes any other active cycle, and creates
 * the missing drafts. Running it again creates nothing twice.
 */
export async function openCycle(
  db: Database,
  input: { name: string; description?: string | null; actorId: string; now?: Date },
): Promise<{ cycleId: string; createdCycle: boolean; closed: number; draftsCreated: number }> {
  const now = input.now ?? new Date();
  const plan = await planOpenCycle(db, input.name);
  return db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const closed = await tx.reviewCycle.updateMany({
        where: { id: { in: plan.closing.map((cycle) => cycle.id) } },
        data: { isActive: false, closedAt: now },
      });
      const cycle = plan.cycle
        ? await tx.reviewCycle.update({
            where: { id: plan.cycle.id },
            data: { isActive: true, closedAt: null },
            select: { id: true, name: true },
          })
        : await tx.reviewCycle.create({
            data: {
              name: input.name,
              description: input.description ?? null,
              isActive: true,
              startedAt: now,
              createdById: input.actorId,
            },
            select: { id: true, name: true },
          });
      if (!plan.cycle) {
        await recordActivity(
          {
            actorId: input.actorId,
            action: "REVIEW_CYCLE_CREATED",
            entityType: "REVIEW_CYCLE",
            entityId: cycle.id,
            description: `Created and activated the ${cycle.name} review cycle.`,
          },
          tx,
        );
      }
      for (const draft of plan.drafts) {
        await tx.submission.create({
          data: {
            title: `Academic Bulletin Submission - ${draft.programmeName}`,
            programmeId: draft.programmeId,
            createdById: input.actorId,
            cycleId: cycle.id,
            status: "DRAFT",
            currentPhase: 1,
            content: {
              create: {
                sectionA: {},
                sectionB: {},
                sectionC: {},
                sectionD: {},
                sectionE: {},
                sectionF: {},
                sectionG: {},
                sectionH: {},
              },
            },
          },
        });
      }
      if (plan.drafts.length > 0) {
        await recordActivity(
          {
            actorId: input.actorId,
            action: "SUBMISSIONS_INITIALIZED",
            entityType: "REVIEW_CYCLE",
            entityId: cycle.id,
            description: `Created ${plan.drafts.length} programme drafts for ${cycle.name} (${plan.drafts.filter((draft) => draft.isNew).length} new programmes).`,
            metadata: { createdCount: plan.drafts.length, closedCycles: plan.closing.map((item) => item.name) },
          },
          tx,
        );
      }
      return {
        cycleId: cycle.id,
        createdCycle: !plan.cycle,
        closed: closed.count,
        draftsCreated: plan.drafts.length,
      };
    },
    { timeout: 120_000 },
  );
}
