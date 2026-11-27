/**
 * Tasks W2 and W3 on the server: reading the contact hours and the elective
 * group a course is saved with.
 */
import prisma from "@/lib/prisma";

/** A semester's contact hours can't exceed this (40 hours a week for 15 weeks). */
export const MAX_CONTACT_HOURS = 600;

export const HOURS_RULE_MESSAGE = `Contact hours are a whole number from 0 to ${MAX_CONTACT_HOURS}, or left empty.`;

/** undefined: not sent; null: cleared; a number: the hours. */
export function readHours(value: unknown): { ok: true; value: number | null | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > MAX_CONTACT_HOURS) return { ok: false };
  return { ok: true, value: number };
}

/** The elective group must belong to the same draft. */
export async function readElectiveGroup(
  value: unknown,
  submissionId: string,
): Promise<{ ok: true; value: string | null | undefined } | { ok: false }> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const group = await prisma.electiveGroup.findFirst({ where: { id: value, submissionId }, select: { id: true } });
  return group ? { ok: true, value: group.id } : { ok: false };
}

export const GROUP_RULE_MESSAGE = "That elective group isn't on this draft.";
