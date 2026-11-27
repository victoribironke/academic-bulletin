/**
 * The Course Registry rows a person may list (K6: only what you may see),
 * plus the search term and the "offered" choice (B5). Shared by the Registry
 * list and its filter counts (K5), so both count the same courses.
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { formatCourseCode } from "@/lib/validation/name-format";

/**
 * B5: a course Babcock offers is linked to a Babcock programme or has a
 * Babcock (BU-) code; the rest are reference courses from the national
 * curriculum only.
 */
export const OFFERED_COURSE: Prisma.MasterCourseWhereInput = {
  OR: [{ programmeLinks: { some: {} } }, { code: { startsWith: "BU-" } }],
};

type ScopeUser = { role: string; departmentId?: string | null; schoolId?: string | null };

export async function registryScope(
  user: ScopeUser,
  searchParams: URLSearchParams,
): Promise<{ ok: true; where: Record<string, unknown> } | { ok: false; error: string }> {
  let departmentId = searchParams.get("departmentId");
  let schoolId = searchParams.get("schoolId");
  if (["HOD", "PROGRAMME_COORDINATOR"].includes(user.role)) {
    if (!user.departmentId) return { ok: false, error: "Your account is not assigned to a department." };
    departmentId = user.departmentId;
    schoolId = null;
  } else if (user.role === "DEAN") {
    if (!user.schoolId) return { ok: false, error: "Your account is not assigned to a school." };
    departmentId = null;
    schoolId = user.schoolId;
  }

  const where: Record<string, unknown> = {};
  // When the import dialog requests only discoverable courses, filter accordingly
  if (searchParams.get("discoverable") === "true") where.discoverable = true;

  if (departmentId || schoolId) {
    const OR: Array<Record<string, unknown>> = [];
    if (departmentId) OR.push({ ownerDeptId: departmentId });
    if (schoolId) OR.push({ ownerSchoolId: schoolId });
    OR.push({ ownership: "INSTITUTIONAL" });
    OR.push({ type: "GENERAL" });
    if (departmentId && !schoolId) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { schoolId: true } });
      if (dept?.schoolId) OR.push({ ownerSchoolId: dept.schoolId });
    }
    where.OR = OR;
  }

  // K0: the search term, under any of the names callers use.
  const query = (searchParams.get("q") ?? searchParams.get("search") ?? searchParams.get("query"))?.trim();
  if (query) {
    // "gst112" and "BU-GST112" find "GST 112" and "BU-GST 112" too.
    const tidyCode = formatCourseCode(query);
    const search: Prisma.MasterCourseWhereInput = {
      OR: [
        { code: { contains: query, mode: "insensitive" } },
        ...(tidyCode && tidyCode !== query ? [{ code: { contains: tidyCode, mode: "insensitive" as const } }] : []),
        { title: { contains: query, mode: "insensitive" } },
      ],
    };
    where.AND = [search];
  }
  // B5: "only" lists courses Babcock offers (linked to a programme, or a BU- code).
  if (searchParams.get("offered") === "only") {
    where.AND = [...((where.AND as Prisma.MasterCourseWhereInput[] | undefined) ?? []), OFFERED_COURSE];
  }
  return { ok: true, where };
}
