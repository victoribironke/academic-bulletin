import { NextResponse } from "next/server";
import { generateDepartmentBulletin } from "@/lib/bulletin/generation";
import { generateBulletinDocx } from "@/lib/bulletin/export-docx";
import { generateBulletinPdf } from "@/lib/bulletin/export-pdf";
import prisma from "@/lib/prisma";

// GET /api/bulletin/export?submissionId=...&format=docx|pdf
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get("submissionId");
    const format = searchParams.get("format") || "docx";

    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 },
      );
    }

    if (!["docx", "pdf"].includes(format)) {
      return NextResponse.json(
        { error: "format must be 'docx' or 'pdf'" },
        { status: 400 },
      );
    }

    // Look up submission to get programmeId and academicYear
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { programmeId: true, academicYear: true, title: true },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    // Generate bulletin data
    const bulletinData = await generateDepartmentBulletin(
      submission.programmeId,
      submission.academicYear,
      submissionId,
    );

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

    const filename = `${submission.title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}_Bulletin.${extension}`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
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
