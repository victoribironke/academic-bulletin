import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type ActivityDatabase = Pick<Prisma.TransactionClient, "activityLog">;

export type ActivityInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  metadata?: Prisma.InputJsonValue;
  /**
   * Skip writing a new entry when the same person already logged the same
   * action, with the same description, on the same record within this many
   * minutes. Use it for actions that fire repeatedly, such as autosaves, so
   * one editing session shows up once instead of hundreds of times. Entries
   * are never edited.
   */
  coalesceWithinMinutes?: number;
};

/** How long repeated autosaves by one person on one record count as one entry. */
export const AUTOSAVE_COALESCE_MINUTES = 30;

/**
 * Adds an append-only audit entry. Pass a transaction client when the audit
 * record must commit atomically with the action it describes.
 */
export async function recordActivity(
  input: ActivityInput,
  database: ActivityDatabase = prisma,
) {
  const actorId = input.actorId || null;
  const entityId = input.entityId || null;

  if (input.coalesceWithinMinutes && actorId && entityId) {
    const since = new Date(Date.now() - input.coalesceWithinMinutes * 60_000);
    const recent = await database.activityLog.findFirst({
      where: {
        actorId,
        action: input.action,
        entityType: input.entityType,
        entityId,
        description: input.description,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) return recent;
  }

  return database.activityLog.create({
    data: {
      actorId,
      action: input.action,
      entityType: input.entityType,
      entityId,
      description: input.description,
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    },
  });
}
