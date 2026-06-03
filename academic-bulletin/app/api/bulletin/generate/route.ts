import { NextResponse } from "next/server";
import {
  generateDepartmentBulletin,
  generateSchoolBulletin,
  generateInstitutionBulletin,
  ExportLevel,
} from "@/lib/bulletin/generation";

// GET /api/bulletin/generate - Generate bulletin data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level") as ExportLevel;
    const programmeId = searchParams.get("programmeId");
    const schoolId = searchParams.get("schoolId");
    const submissionId = searchParams.get("submissionId");

    // Validate required params
    if (!level) {
      return NextResponse.json({ error: "level is required" }, { status: 400 });
    }

    // Validate level
    if (!["department", "school", "institution"].includes(level)) {
      return NextResponse.json(
        { error: "level must be 'department', 'school', or 'institution'" },
        { status: 400 },
      );
    }

    let bulletinData;

    switch (level) {
      case "department":
        if (!programmeId) {
          return NextResponse.json(
            { error: "programmeId is required for department-level export" },
            { status: 400 },
          );
        }
        bulletinData = await generateDepartmentBulletin(
          programmeId,
          submissionId || undefined,
        );
        break;

      case "school":
        if (!schoolId) {
          return NextResponse.json(
            { error: "schoolId is required for school-level export" },
            { status: 400 },
          );
        }
        bulletinData = await generateSchoolBulletin(schoolId);
        break;

      case "institution":
        bulletinData = await generateInstitutionBulletin();
        break;

      default:
        return NextResponse.json(
          { error: "Invalid export level" },
          { status: 400 },
        );
    }

    return NextResponse.json(bulletinData);
  } catch (error) {
    console.error("Failed to generate bulletin:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate bulletin",
      },
      { status: 500 },
    );
  }
}
