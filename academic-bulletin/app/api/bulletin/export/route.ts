import { NextResponse } from "next/server";
import {
  generateDepartmentBulletin,
  generateSchoolBulletin,
  generateInstitutionBulletin,
} from "@/lib/bulletin/generation";
import { generateBulletinDocx } from "@/lib/bulletin/export-docx";
import { generateBulletinPdf } from "@/lib/bulletin/export-pdf";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { canExportBulletin } from "@/lib/bulletin/access";

// GET /api/bulletin/export?level=...&format=docx|pdf&submissionId=...&programmeId=...&departmentId=...&schoolId=...
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "docx";
    const level = searchParams.get("level") || "programme";
    const submissionId = searchParams.get("submissionId");
    const programmeId = searchParams.get("programmeId");
    const departmentId = searchParams.get("departmentId");
    const schoolId = searchParams.get("schoolId");

    if (!["docx", "pdf"].includes(format)) {
      return NextResponse.json(
        { error: "format must be 'docx' or 'pdf'" },
        { status: 400 },
      );
    }

    if (
      !(await canExportBulletin(auth.user, {
        level,
        submissionId,
        programmeId,
        departmentId,
        schoolId,
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let bulletinData;
    let filename: string;

    // If a specific submissionId is provided, do a programme-level export from that submission
    if (submissionId) {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { programmeId: true, title: true },
      });

      if (!submission) {
        return NextResponse.json(
          { error: "Submission not found" },
          { status: 404 },
        );
      }

      bulletinData = await generateDepartmentBulletin(
        submission.programmeId,
        submissionId,
      );
      filename = submission.title
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .replace(/\s+/g, "_");
    } else if (level === "programme" || level === "department") {
      // programme and department level require a programmeId or departmentId
      if (programmeId) {
        bulletinData = await generateDepartmentBulletin(programmeId);
        filename = `Programme_Bulletin`;
      } else if (departmentId) {
        // Find all programmes in the department and generate school-level style
        const dept = await prisma.department.findUnique({
          where: { id: departmentId },
          select: { schoolId: true, name: true },
        });
        if (!dept) {
          return NextResponse.json(
            { error: "Department not found" },
            { status: 404 },
          );
        }
        // For department-level, we use school bulletin but filtered to one department
        const schoolData = await generateSchoolBulletin(dept.schoolId);
        schoolData.programmes = schoolData.programmes.filter(
          (p) => p.department === dept.name,
        );
        schoolData.title = `${dept.name} - Academic Bulletin`;
        bulletinData = schoolData;
        filename = `${dept.name.replace(/\s+/g, "_")}_Bulletin`;
      } else {
        return NextResponse.json(
          {
            error:
              "programmeId or departmentId is required for programme/department export",
          },
          { status: 400 },
        );
      }
    } else if (level === "school") {
      if (!schoolId) {
        return NextResponse.json(
          { error: "schoolId is required for school-level export" },
          { status: 400 },
        );
      }
      bulletinData = await generateSchoolBulletin(schoolId);
      filename = `School_Bulletin`;
    } else if (level === "institution") {
      bulletinData = await generateInstitutionBulletin();
      filename = "Institution_Bulletin";
    } else {
      return NextResponse.json(
        {
          error:
            "Invalid level. Must be 'programme', 'department', 'school', or 'institution'",
        },
        { status: 400 },
      );
    }

    // Generate document buffer
    let buffer: Buffer;
    let contentType: string;
    let extension: string;

    if (format === "pdf") {
      buffer = await generateBulletinPdf(bulletinData);
      contentType = "application/pdf";
      extension = "pdf";
    } else {
      buffer = await generateBulletinDocx(bulletinData);
      contentType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      extension = "docx";
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}.${extension}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("Failed to export bulletin:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to export bulletin",
      },
      { status: 500 },
    );
  }
}
