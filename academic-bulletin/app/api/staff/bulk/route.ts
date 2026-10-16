import { NextResponse } from "next/server";
import {
  AcademicQualification,
  AcademicRank,
  Gender,
  StaffType,
  Title,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { canAccessDepartment, requireApiUser } from "@/lib/api-auth";
import {
  staffDuplicateKey,
  validateStaffImportRows,
} from "@/lib/imports/staff";
import { toTitleCase } from "@/lib/validation/name-format";

const MAX_IMPORT_ROWS = 500;

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["HOD", "ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const departmentId = String(body.departmentId || "");
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!departmentId || rows.length === 0) {
      return NextResponse.json(
        { error: "departmentId and at least one staff row are required" },
        { status: 400 },
      );
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_IMPORT_ROWS} staff members can be imported at once.` },
        { status: 400 },
      );
    }
    if (!(await canAccessDepartment(auth.user, departmentId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.staff.findMany({
      where: { departmentId },
      select: { email: true, surname: true, firstName: true, middleName: true },
    });
    const validated = validateStaffImportRows(rows, existing.map(staffDuplicateKey));
    const invalid = validated.filter((row) => row.errors.length > 0 || !row.data);
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "The import contains invalid or duplicate staff rows.",
          issues: invalid.map((row) => ({ row: row.rowNumber, errors: row.errors })),
        },
        { status: 400 },
      );
    }

    const result = await prisma.staff.createMany({
      data: validated.map(({ data }) => ({
        departmentId,
        title: data!.title as Title,
        gender: data!.gender as Gender,
        surname: toTitleCase(data!.surname),
        firstName: toTitleCase(data!.firstName),
        middleName: data!.middleName ? toTitleCase(data!.middleName) : null,
        highestQualification: data!.highestQualification as AcademicQualification,
        academicRank: data!.academicRank as AcademicRank,
        customJobTitle: data!.customJobTitle ? toTitleCase(data!.customJobTitle) : null,
        specialization: data!.specialization || null,
        email: data!.email || null,
        type: data!.type as StaffType,
      })),
    });

    return NextResponse.json({ imported: result.count }, { status: 201 });
  } catch (error) {
    console.error("Failed to bulk import staff:", error);
    return NextResponse.json({ error: "Failed to import staff members" }, { status: 500 });
  }
}
