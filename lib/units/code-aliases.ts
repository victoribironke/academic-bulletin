/**
 * Old school, department and programme codes (task A5). Until the end of
 * Departmental Drafting (February 4, 2027) an upload that uses an old code
 * is accepted, with a warning naming the new code, and searches still find
 * the unit.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";

export type UnitKind = "SCHOOL" | "DEPARTMENT" | "PROGRAMME";

export type CodeLookup = {
  /** The record's id for a current or still-valid old code, or undefined. */
  resolve: (code: string) => { id: string; warning?: string } | undefined;
};

/** Builds a lookup from current codes plus old codes still in their grace period. */
export function buildCodeLookup(
  kind: UnitKind,
  current: { id: string; code: string }[],
  aliases: { kind: string; oldCode: string; newCode: string; entityId: string; validUntil: Date }[],
  now: Date = new Date(),
): CodeLookup {
  const byCode = new Map(current.map((unit) => [unit.code.toUpperCase(), unit.id]));
  const label = kind === "SCHOOL" ? "school" : kind === "DEPARTMENT" ? "department" : "programme";
  const byOldCode = new Map(
    aliases
      .filter((alias) => alias.kind === kind && alias.validUntil > now)
      .map((alias) => [alias.oldCode.toUpperCase(), alias]),
  );
  return {
    resolve(code) {
      const key = code.trim().toUpperCase();
      const id = byCode.get(key);
      if (id) return { id };
      const alias = byOldCode.get(key);
      if (!alias) return undefined;
      return {
        id: alias.entityId,
        warning: `${key} is the old ${label} code; it is now ${alias.newCode}. Use ${alias.newCode} in future uploads.`,
      };
    },
  };
}

/** Lookups for all three kinds, read from the database. */
export async function loadCodeLookups(
  db: PrismaClient | Prisma.TransactionClient = prisma,
  now: Date = new Date(),
) {
  const [schools, departments, programmes, aliases] = await Promise.all([
    db.school.findMany({ select: { id: true, code: true } }),
    db.department.findMany({ select: { id: true, code: true } }),
    db.programme.findMany({ select: { id: true, code: true } }),
    db.codeAlias.findMany({ where: { validUntil: { gt: now } } }),
  ]);
  return {
    school: buildCodeLookup("SCHOOL", schools, aliases, now),
    department: buildCodeLookup("DEPARTMENT", departments, aliases, now),
    programme: buildCodeLookup("PROGRAMME", programmes, aliases, now),
  };
}
