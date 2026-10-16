import { NextResponse } from "next/server";
import { CourseStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import {
  courseDuplicateKeys,
  validateCourseImportRows,
} from "@/lib/imports/courses";

const MAX_IMPORT_ROWS = 500;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const submissionId = String(body.submissionId || "");
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!submissionId || rows.length === 0) {
      return NextResponse.json(
        { error: "submissionId and at least one course row are required" },
        { status: 400 },
      );
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_IMPORT_ROWS} courses can be imported at once.` },
        { status: 400 },
      );
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(user, submissionId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { programme: { select: { duration: true } } },
    });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const existing = await prisma.course.findMany({
      where: { submissionId },
      select: { code: true, title: true },
    });
    const allowedLevels = Array.from(
      { length: submission.programme.duration || 4 },
      (_, index) => (index + 1) * 100,
    );
    const validated = validateCourseImportRows(rows, {
      allowedLevels,
      existingCodes: existing.map((course) => courseDuplicateKeys(course).code),
      existingTitles: existing.map((course) => courseDuplicateKeys(course).title),
    });
    const invalid = validated.filter((row) => row.errors.length > 0 || !row.data);
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "The import contains invalid or duplicate course rows.",
          issues: invalid.map((row) => ({ row: row.rowNumber, errors: row.errors })),
        },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (transaction) => {
      for (const { data } of validated) {
        const row = data!;
        const hasDescription =
          row.learningOutcomes.length > 0 ||
          row.courseContent ||
          row.labWork ||
          row.entrepreneurialAspect;
        await transaction.course.create({
          data: {
            submissionId,
            code: row.code,
            title: row.title,
            units: row.units,
            status: row.status as CourseStatus,
            semester: row.semester,
            level: row.level,
            prerequisites: row.prerequisites || null,
            description: hasDescription
              ? {
                  create: {
                    submissionId,
                    learningOutcomes: row.learningOutcomes,
                    courseContent: row.courseContent || null,
                    labWork: row.labWork || null,
                    entrepreneurialAspect: row.entrepreneurialAspect || null,
                  },
                }
              : undefined,
          },
        });
      }
    });

    return NextResponse.json({ imported: validated.length }, { status: 201 });
  } catch (error) {
    console.error("Failed to bulk import courses:", error);
    return NextResponse.json({ error: "Failed to import courses" }, { status: 500 });
  }
}
