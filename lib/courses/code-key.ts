/**
 * Task B3: two course codes are the same when they match ignoring letter
 * case, spaces and hyphens ("BIO102", "bio 102" and "BIO-102" are all
 * "BIO 102"). The database rule after the clean-up uses the same key
 * (prisma/migrations/20261124130000_course_code_unique).
 */
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { formatCourseCode } from "@/lib/validation/name-format";

export function courseCodeKey(code: string): string {
  return formatCourseCode(code).toUpperCase().replace(/[\s-]+/g, "");
}

/** Another Registry course with the same code in any spacing, if there is one. */
export async function findSameCodeCourse(
  code: string,
  excludeId?: string,
): Promise<{ id: string; code: string; title: string } | null> {
  const rows = await prisma.$queryRaw<{ id: string; code: string; title: string }[]>(Prisma.sql`
    SELECT id, code, title FROM master_courses
    WHERE upper(regexp_replace(code, '[[:space:]-]+', '', 'g')) = ${courseCodeKey(code)}
    ${excludeId ? Prisma.sql`AND id <> ${excludeId}` : Prisma.empty}
    LIMIT 1`);
  return rows[0] ?? null;
}

export function sameCodeMessage(existing: { code: string; title: string }): string {
  return `${existing.code} (${existing.title}) already has this code. One code belongs to one course (B3).`;
}
