import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { couldNot } from "@/lib/messages";

// GET /api/academic-units - Fetch the full tree (Schools -> Departments -> Programmes)
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    // B15: hidden programmes are seen only by administrators.
    const seesHidden = ["ADMIN", "SUPER_ADMIN"].includes(auth.user.role);
    const [units, aliases] = await Promise.all([
      prisma.school.findMany({
        orderBy: { name: "asc" },
        include: {
          departments: {
            orderBy: { name: "asc" },
            include: {
              programmes: {
                where: seesHidden ? {} : { isHidden: false },
                orderBy: { name: "asc" },
              },
            },
          },
        },
      }),
      // A5: old codes still find their unit until February 4, 2027.
      prisma.codeAlias.findMany({
        where: { validUntil: { gt: new Date() } },
        select: { entityId: true, oldCode: true },
      }),
    ]);
    const formerCodes = new Map<string, string[]>();
    for (const alias of aliases) {
      formerCodes.set(alias.entityId, [...(formerCodes.get(alias.entityId) ?? []), alias.oldCode]);
    }
    const withFormer = <T extends { id: string }>(unit: T) => ({ ...unit, formerCodes: formerCodes.get(unit.id) ?? [] });

    return NextResponse.json(
      units.map((school) => ({
        ...withFormer(school),
        departments: school.departments.map((department) => ({
          ...withFormer(department),
          programmes: department.programmes.map(withFormer),
        })),
      })),
    );
  } catch (error) {
    console.error("Failed to fetch academic units:", error);
    return NextResponse.json(
      { error: couldNot("load academic units structure") },
      { status: 500 },
    );
  }
}
