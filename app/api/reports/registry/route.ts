import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { type CompletenessReport, SEMESTER_CREDIT_RANGE, loadCompletenessReport } from "@/lib/reports/registry-completeness";
import { couldNot } from "@/lib/messages";

/**
 * GET /api/reports/registry: the Registry completeness report (task B8),
 * for Academic Planning. ?format=xlsx downloads it as a spreadsheet.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const started = Date.now();
    const report = await loadCompletenessReport();
    const tookMs = Date.now() - started;

    if (new URL(request.url).searchParams.get("format") === "xlsx") {
      const buffer = await reportWorkbook(report);
      const day = report.generatedAt.slice(0, 10);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="registry-completeness-${day}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ ...report, tookMs });
  } catch (error) {
    console.error("Failed to build the Registry completeness report:", error);
    return NextResponse.json({ error: couldNot("build the report") }, { status: 500 });
  }
}

async function reportWorkbook(report: CompletenessReport): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(report.generatedAt);
  const sheet = (name: string, columns: { header: string; key: string; width: number }[], rows: object[]) => {
    const worksheet = workbook.addWorksheet(name);
    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    worksheet.addRows(rows);
  };
  sheet(
    "Programmes",
    [
      { header: "Programme code", key: "code", width: 16 },
      { header: "Programme", key: "name", width: 40 },
      { header: "New programme", key: "isNew", width: 14 },
      { header: "Courses", key: "courses", width: 10 },
      { header: "Total credits", key: "totalCredits", width: 13 },
      { header: "Total stated in the draft", key: "statedTotal", width: 22 },
      { header: `Semesters outside ${SEMESTER_CREDIT_RANGE.min}-${SEMESTER_CREDIT_RANGE.max} credits`, key: "semestersOutOfRange", width: 26 },
      { header: "No description", key: "missingDescription", width: 15 },
      { header: "No learning outcomes", key: "missingOutcomes", width: 20 },
      { header: "No owner", key: "noOwner", width: 10 },
      { header: "Possible duplicates", key: "duplicates", width: 18 },
    ],
    report.programmes.map((programme) => ({ ...programme, isNew: programme.isNew ? "Yes" : "", statedTotal: programme.statedTotal ?? "Not stated" })),
  );
  sheet(
    "Semesters",
    [
      { header: "Programme code", key: "programmeCode", width: 16 },
      { header: "Programme", key: "programmeName", width: 40 },
      { header: "Level", key: "level", width: 8 },
      { header: "Semester", key: "semester", width: 11 },
      { header: "Courses", key: "courses", width: 10 },
      { header: "Credits", key: "credits", width: 10 },
      { header: `Within ${SEMESTER_CREDIT_RANGE.min}-${SEMESTER_CREDIT_RANGE.max}`, key: "withinRange", width: 12 },
    ],
    report.semesters.map((row) => ({ ...row, withinRange: row.withinRange === null ? "Sessional" : row.withinRange ? "Yes" : "No" })),
  );
  sheet(
    "Course issues",
    [
      { header: "Programme code", key: "programmeCode", width: 16 },
      { header: "Programme", key: "programmeName", width: 40 },
      { header: "Course code", key: "code", width: 14 },
      { header: "Course title", key: "title", width: 44 },
      { header: "Issue", key: "issue", width: 60 },
    ],
    report.issues,
  );
  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
