import { NextResponse } from "next/server";
import { CourseOwnership, CourseType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import {
  courseDuplicateKeys,
  validateMasterCourseImportRows,
} from "@/lib/imports/courses";
import { recordActivity } from "@/lib/activity-log";
import { preloadRegistryCoursesForSubmission } from "@/lib/courses/gst-pool";
import { matchProgrammeNames } from "@/lib/courses/programme-matching";

const MAX_IMPORT_ROWS = 5000;

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

    const existing = await prisma.masterCourse.findMany({
      select: { id: true, code: true, title: true },
    });
    const validated = validateMasterCourseImportRows(rows, {
      existingCodes: existing.map((course) => courseDuplicateKeys(course).code),
      existingTitles: existing.map((course) => courseDuplicateKeys(course).title),
      allowExisting: true,
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
    const [departments, schools, programmes] = await Promise.all([
      prisma.department.findMany({ where: { code: { in: departmentCodes } }, select: { id: true, code: true } }),
      prisma.school.findMany({ where: { code: { in: schoolCodes } }, select: { id: true, code: true } }),
      prisma.programme.findMany({
        select: { id: true, code: true, name: true, degreeType: true },
      }),
    ]);
    const departmentByCode = new Map(departments.map((department) => [department.code.toUpperCase(), department.id]));
    const schoolByCode = new Map(schools.map((school) => [school.code.toUpperCase(), school.id]));
    const programmeByCode = new Map(
      programmes.map((programme) => [programme.code.toUpperCase(), programme.id]),
    );
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
      const unknownProgrammes = data.programmeCodes.filter(
        (code) => !programmeByCode.has(code),
      );
      if (unknownProgrammes.length > 0) {
        return [
          {
            row: row.rowNumber,
            errors: [`Unknown programme code(s): ${unknownProgrammes.join(", ")}.`],
          },
        ];
      }
      return [];
    });
    if (ownerIssues.length > 0) {
      return NextResponse.json(
        { error: "Some owner codes do not exist.", issues: ownerIssues },
        { status: 400 },
      );
    }

    const existingCodes = new Set(
      existing.map((course) => course.code.toUpperCase()),
    );
    let created = 0;
    let updated = 0;
    let linked = 0;
    const affectedProgrammeIds = new Set<string>();
    const unmatchedSourceProgrammes = new Set<string>();
    const ambiguousSourceProgrammes = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const { data } of validated) {
        const row = data!;
        const courseData = {
          title: row.title,
          units: row.units,
          type: row.type as CourseType,
          ownership: row.ownership as CourseOwnership,
          level: row.level,
          semester: row.semester,
          description: row.description || null,
          learningOutcomes: row.learningOutcomes,
          courseContent: row.courseContent || null,
          labWork: row.labWork || null,
          entrepreneurialAspect: row.entrepreneurialAspect || null,
          curriculumSource: row.curriculumSource || null,
          sourceReference: row.sourceReference || null,
          sourceProgrammes: row.sourceProgrammes,
          discoverable: row.discoverable,
          ownerDeptId: row.ownerDepartmentCode
            ? departmentByCode.get(row.ownerDepartmentCode)
            : null,
          ownerSchoolId:
            row.ownership === "SCHOOL"
              ? schoolByCode.get(row.ownerSchoolCode)
              : null,
        };
        const course = await tx.masterCourse.upsert({
          where: { code: row.code },
          create: { code: row.code, ...courseData },
          update: courseData,
          select: { id: true },
        });
        if (existingCodes.has(row.code.toUpperCase())) updated += 1;
        else created += 1;

        const sourceMatches = matchProgrammeNames(
          row.sourceProgrammes,
          programmes,
        );
        sourceMatches.unmatchedNames.forEach((name) =>
          unmatchedSourceProgrammes.add(name),
        );
        sourceMatches.ambiguousNames.forEach((name) =>
          ambiguousSourceProgrammes.add(name),
        );
        const resolvedProgrammeIds = new Set([
          ...row.programmeCodes.map((code) => programmeByCode.get(code)!),
          ...sourceMatches.matchedIds,
        ]);
        resolvedProgrammeIds.forEach((id) => affectedProgrammeIds.add(id));

        if (resolvedProgrammeIds.size > 0) {
          const linkResult = await tx.programmeCourse.createMany({
            data: [...resolvedProgrammeIds].map((programmeId) => ({
              courseId: course.id,
              programmeId,
              isCore: row.type !== "ELECTIVE",
            })),
            skipDuplicates: true,
          });
          linked += linkResult.count;
        }
      }

      await recordActivity(
        {
          actorId: auth.user.id,
          action: "REGISTRY_COURSES_IMPORTED",
          entityType: "MASTER_COURSE",
          description: `Imported ${created} new and updated ${updated} existing Registry courses.`,
          metadata: {
            created,
            updated,
            programmeLinksCreated: linked,
            sources: Array.from(
              new Set(validated.map((row) => row.data!.curriculumSource).filter(Boolean)),
            ),
          },
        },
        tx,
      );
    });

    const affectsEveryProgramme = validated.some(
      (row) =>
        row.data!.ownership === "INSTITUTIONAL" &&
        ["GST_NUC", "GST_BU"].includes(row.data!.type),
    );
    const editableSubmissions = await prisma.submission.findMany({
      where: {
        status: { in: ["DRAFT", "CORRECTIONS_REQUIRED"] },
        ...(!affectsEveryProgramme && {
          programmeId: { in: [...affectedProgrammeIds] },
        }),
      },
      select: { id: true },
    });
    for (const submission of editableSubmissions) {
      await preloadRegistryCoursesForSubmission(submission.id);
    }

    return NextResponse.json(
      {
        imported: created,
        updated,
        linked,
        submissionsPreloaded: editableSubmissions.length,
        unmatchedSourceProgrammes: [...unmatchedSourceProgrammes].sort(),
        ambiguousSourceProgrammes: [...ambiguousSourceProgrammes].sort(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to bulk import Registry courses:", error);
    return NextResponse.json({ error: "Failed to import Registry courses" }, { status: 500 });
  }
}
