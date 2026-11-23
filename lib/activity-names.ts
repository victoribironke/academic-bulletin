/**
 * Plain names for Activity Log records (task A4): the programme, cycle,
 * person or course an entry is about, never its record ID. Records that were
 * deleted into the Archive keep the name they had there.
 */
import prisma from "@/lib/prisma";

const ENTITY_LABELS: Record<string, string> = {
  SUBMISSION: "Programme",
  REVIEW_CYCLE: "Review cycle",
  USER: "Person",
  SCHOOL: "School",
  DEPARTMENT: "Department",
  PROGRAMME: "Programme",
  MASTER_COURSE: "Registry course",
  STAFF: "Staff",
  POLICY: "Academic Policy",
  SYSTEM: "System",
};

/** "Review cycle", "Registry course", or the type in words. */
export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.toLowerCase().replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

/** Names for the given records, keyed "TYPE:id". */
export async function recordNames(entries: { entityType: string; entityId: string | null }[]): Promise<Map<string, string>> {
  const idsOf = (type: string) => [
    ...new Set(entries.filter((entry) => entry.entityType === type && entry.entityId).map((entry) => entry.entityId!)),
  ];
  const names = new Map<string, string>();
  const put = (type: string, id: string, name: string) => names.set(`${type}:${id}`, name);

  const [drafts, cycles, users, schools, departments, programmes, courses, staff, policies] = await Promise.all([
    prisma.submission.findMany({ where: { id: { in: idsOf("SUBMISSION") } }, select: { id: true, programme: { select: { name: true } } } }),
    prisma.reviewCycle.findMany({ where: { id: { in: idsOf("REVIEW_CYCLE") } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: idsOf("USER") } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.school.findMany({ where: { id: { in: idsOf("SCHOOL") } }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { id: { in: idsOf("DEPARTMENT") } }, select: { id: true, name: true } }),
    prisma.programme.findMany({ where: { id: { in: idsOf("PROGRAMME") } }, select: { id: true, name: true } }),
    prisma.masterCourse.findMany({ where: { id: { in: idsOf("MASTER_COURSE") } }, select: { id: true, code: true, title: true } }),
    prisma.staff.findMany({ where: { id: { in: idsOf("STAFF") } }, select: { id: true, surname: true, firstName: true } }),
    prisma.policyVersion.findMany({ where: { id: { in: idsOf("POLICY") } }, select: { id: true, label: true } }),
  ]);
  for (const draft of drafts) put("SUBMISSION", draft.id, draft.programme.name);
  for (const cycle of cycles) put("REVIEW_CYCLE", cycle.id, cycle.name);
  for (const user of users) put("USER", user.id, `${user.firstName} ${user.lastName}`);
  for (const school of schools) put("SCHOOL", school.id, school.name);
  for (const department of departments) put("DEPARTMENT", department.id, department.name);
  for (const programme of programmes) put("PROGRAMME", programme.id, programme.name);
  for (const course of courses) put("MASTER_COURSE", course.id, `${course.code} ${course.title}`);
  for (const person of staff) put("STAFF", person.id, `${person.surname}, ${person.firstName}`);
  for (const policy of policies) put("POLICY", policy.id, policy.label);

  // Deleted records keep the name they had in the Archive.
  const missing = entries.filter((entry) => entry.entityId && !names.has(`${entry.entityType}:${entry.entityId}`));
  if (missing.length > 0) {
    const archived = await prisma.archivedRecord.findMany({
      where: { entityId: { in: [...new Set(missing.map((entry) => entry.entityId!))] } },
      select: { entityType: true, entityId: true, label: true },
    });
    for (const record of archived) {
      const key = `${record.entityType}:${record.entityId}`;
      if (!names.has(key)) names.set(key, `${record.label} (deleted)`);
    }
  }
  return names;
}
