import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDateWithDay, formatTime } from "@/lib/dates/format";
import { cleanCourseTitle, formatCourseTitle, withoutTypedCode } from "@/lib/validation/name-format";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(name) ? [path] : [];
  });
}

describe("one date format (Q1)", () => {
  const thursday = new Date("2026-11-26T07:00:00Z");

  it("writes dates as November 26, 2026, in Lagos time", () => {
    expect(formatDate(thursday)).toBe("November 26, 2026");
    expect(formatDate("2026-11-25T23:30:00Z")).toBe("November 26, 2026");
    expect(formatDateWithDay(thursday)).toBe("Thursday, November 26, 2026");
    expect(formatTime(thursday)).toBe("8:00 am");
    expect(formatDateTime("2026-11-26T13:05:00Z")).toBe("November 26, 2026, 2:05 pm");
  });

  it("leaves no other date format in the screens, emails or exports", () => {
    const allowed = [join("lib", "dates"), join("lib", "calendar"), join("lib", "sign-in-access.ts"), join("lib", "submissions", "submission-window.ts")];
    const offenders = ["app", "components", "lib"]
      .flatMap((dir) => sourceFiles(join(process.cwd(), dir)))
      .filter((path) => !allowed.some((part) => path.includes(part)))
      .filter((path) => /toLocaleDateString|toLocaleTimeString|"en-GB"|"en-NG"|from "date-fns"/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("course titles (B4)", () => {
  it("keeps acronyms and Roman numerals as written", () => {
    expect(formatCourseTitle("Use of Library, Study Skills and ICT")).toBe("Use of Library, Study Skills and ICT");
    expect(formatCourseTitle("use of library, study skills and ict")).toBe("Use of Library, Study Skills and ICT");
    expect(formatCourseTitle("Principles of Economics II")).toBe("Principles of Economics II");
    expect(formatCourseTitle("principles of economics ii")).toBe("Principles of Economics II");
    expect(formatCourseTitle("Organic Chemistry IV")).toBe("Organic Chemistry IV");
    expect(formatCourseTitle("Data Analysis using Advanced Excel, SPSS, Power BI or Tableau")).toBe(
      "Data Analysis Using Advanced Excel, SPSS, Power BI or Tableau",
    );
    expect(formatCourseTitle("Introduction to e-Learning")).toBe("Introduction to e-Learning");
  });

  it("puts titles typed in capitals into title case", () => {
    expect(formatCourseTitle("FAMILY BUSINESS AND SUCCESSION PLANNING")).toBe("Family Business and Succession Planning");
    expect(formatCourseTitle("ICT FUNDAMENTALS")).toBe("ICT Fundamentals");
  });

  it("takes a typed course code out of Registry titles and uploads", () => {
    expect(withoutTypedCode("Nigerian Peoples and Culture (gst 212)")).toBe("Nigerian Peoples and Culture");
    expect(withoutTypedCode("Health Principles [BU-GST 112]")).toBe("Health Principles");
    expect(withoutTypedCode("GST 111 - Communication in English")).toBe("Communication in English");
    expect(withoutTypedCode("Statistics for Biology 101")).toBe("Statistics for Biology 101");
    expect(cleanCourseTitle("philosophy, logic and human existence (gst 212)")).toBe("Philosophy, Logic and Human Existence");
  });

  it("leaves a draft row's own code suffix alone (titles are unique within a draft)", () => {
    expect(formatCourseTitle("Nigerian Peoples and Culture (GST 113)")).toBe("Nigerian Peoples and Culture (GST 113)");
  });
});
