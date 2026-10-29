import { NextResponse } from "next/server";
import { CourseOwnership, CourseType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import {
  courseDuplicateKeys,
  validateMasterCourseImportRows,
} from "@/lib/imports/courses";

const MAX_IMPORT_ROWS = 500;

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "At least one course row is required" }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_IMPORT_ROWS} courses can be imported at once.` },
        { status: 400 },
      );
    }

    const existing = await prisma.masterCourse.findMany({ select: { code: true, title: true } });
    const validated = validateMasterCourseImportRows(rows, {
      existingCodes: existing.map((course) => courseDuplicateKeys(course).code),
      existingTitles: existing.map((course) => courseDuplicateKeys(course).title),
    });
    const invalid = validated.filter((row) => row.errors.length > 0 || !row.data);
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "The import contains invalid or duplicate Registry rows.",
          issues: invalid.map((row) => ({ row: row.rowNumber, errors: row.errors })),
        },
        { status: 400 },
      );
    }

    const departmentCodes = Array.from(
      new Set(validated.map((row) => row.data!.ownerDepartmentCode).filter(Boolean)),
    );
    const schoolCodes = Array.from(
      new Set(validated.map((row) => row.data!.ownerSchoolCode).filter(Boolean)),
    );
    const [departments, schools] = await Promise.all([
      prisma.department.findMany({ where: { code: { in: departmentCodes } }, select: { id: true, code: true } }),
      prisma.school.findMany({ where: { code: { in: schoolCodes } }, select: { id: true, code: true } }),
    ]);
    const departmentByCode = new Map(departments.map((department) => [department.code.toUpperCase(), department.id]));
    const schoolByCode = new Map(schools.map((school) => [school.code.toUpperCase(), school.id]));
    const ownerIssues = validated.flatMap((row) => {
      const data = row.data!;
      if (
        data.ownerDepartmentCode &&
        !departmentByCode.has(data.ownerDepartmentCode)
      ) {
        return [{ row: row.rowNumber, errors: [`Unknown department code ${data.ownerDepartmentCode}.`] }];
      }
      if (data.ownership === "SCHOOL" && !schoolByCode.has(data.ownerSchoolCode)) {
        return [{ row: row.rowNumber, errors: [`Unknown school code ${data.ownerSchoolCode}.`] }];
      }
      return [];
    });
    if (ownerIssues.length > 0) {
      return NextResponse.json(
        { error: "Some owner codes do not exist.", issues: ownerIssues },
        { status: 400 },
      );
    }

    const result = await prisma.masterCourse.createMany({
      data: validated.map(({ data }) => ({
        code: data!.code,
        title: data!.title,
        units: data!.units,
        type: data!.type as CourseType,
        ownership: data!.ownership as CourseOwnership,
        level: data!.level,
        semester: data!.semester,
        description: data!.description || null,
        learningOutcomes: data!.learningOutcomes,
        courseContent: data!.courseContent || null,
        labWork: data!.labWork || null,
        entrepreneurialAspect: data!.entrepreneurialAspect || null,
        discoverable: data!.discoverable,
        ownerDeptId:
          data!.ownerDepartmentCode
            ? departmentByCode.get(data!.ownerDepartmentCode)
            : null,
        ownerSchoolId:
          data!.ownership === "SCHOOL"
            ? schoolByCode.get(data!.ownerSchoolCode)
            : null,
      })),
    });

    return NextResponse.json({ imported: result.count }, { status: 201 });
  } catch (error) {
    console.error("Failed to bulk import Registry courses:", error);
    return NextResponse.json({ error: "Failed to import Registry courses" }, { status: 500 });
  }
}
