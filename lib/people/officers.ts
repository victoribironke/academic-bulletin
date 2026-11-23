/**
 * The DAP officer for a school (roster task D1): the Academic Planning admin
 * the roster links to that school. Named in invitations (D3) and in the
 * quick start (H1).
 */
import prisma from "@/lib/prisma";

export type DapOfficer = { name: string; email: string; whatsapp: string | null };

export async function dapOfficerFor(schoolId: string | null | undefined): Promise<DapOfficer | null> {
  if (!schoolId) return null;
  const officer = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, schoolId },
    select: { title: true, firstName: true, lastName: true, email: true, whatsapp: true },
    orderBy: { createdAt: "asc" },
  });
  if (!officer) return null;
  return {
    name: [officer.title, officer.firstName, officer.lastName].filter(Boolean).join(" "),
    email: officer.email,
    whatsapp: officer.whatsapp,
  };
}
