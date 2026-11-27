"use client";

import React from "react";
import { StoredPhoto } from "@/components/shared/stored-photo";
import { Separator } from "@/components/ui/separator";
import { cleanText, departmentLabel } from "@/lib/bulletin/document-utils";
import { SafeRichText } from "@/components/shared/safe-rich-text";
import { BulletinProgramme, BulletinCourse } from "@/lib/bulletin/generation";
import { CreditSummaryTable } from "@/components/courses/credit-summary-table";
import { LEADER_ROLE_LABEL, leaderName } from "@/lib/leaders";
import { OUTCOMES_LEAD, courseHeading, graduationNumbersLine, programmeCreditSummary } from "@/lib/bulletin/course-layout";

interface BulletinProgrammeViewProps {
  programme: BulletinProgramme;
}

export function BulletinProgrammeView({
  programme,
}: BulletinProgrammeViewProps) {
  const academicStaff = programme.staff.filter((s) => s.type === "ACADEMIC");
  const adjunctStaff = programme.staff.filter((s) => s.type === "ADJUNCT");
  const nonAcademicStaff = programme.staff.filter(
    (s) => s.type === "NON_ACADEMIC",
  );
  // E4 and Q4: the Dean and Head, from the records (older drafts: their own photos).
  const leaders = programme.leaders ?? {
    dean: { title: null, name: null, imageUrl: programme.content?.deanImageUrl ?? null },
    hod: { title: null, name: null, imageUrl: programme.content?.hodImageUrl ?? null },
  };
  const leaderCards = (["dean", "hod"] as const).map((role) => ({
    role,
    label: LEADER_ROLE_LABEL[role],
    imageUrl: leaders[role].imageUrl,
    printed: leaderName(leaders[role]),
  }));
  // W4 and W5: the same figures the checks and the exports use.
  const credits = programmeCreditSummary(programme);
  const numbersLine = graduationNumbersLine(credits);

  // Helper to group courses
  // Sessional courses have no semester (B13, rule W17) and get their own table.
  const groupedCourses = programme.courses.reduce(
    (acc, course) => {
      if (!acc[course.level]) acc[course.level] = { sem1: [], sem2: [], sessional: [] };
      if (course.semester === 1) {
        acc[course.level].sem1.push(course);
      } else if (course.semester === 2) {
        acc[course.level].sem2.push(course);
      } else {
        acc[course.level].sessional.push(course);
      }
      return acc;
    },
    {} as Record<
      number,
      { sem1: BulletinCourse[]; sem2: BulletinCourse[]; sessional: BulletinCourse[] }
    >,
  );

  return (
    <div
      className="space-y-6 text-sm print:text-xs mb-12"
      style={{ breakAfter: "page" }}
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">{programme.school.toUpperCase()}</h1>
        <h2 className="text-xl font-semibold">
          {departmentLabel(programme.department)}
        </h2>
        <h3 className="text-lg font-medium">{programme.name}</h3>
      </div>

      <Separator />

      {/* Deans & HODs: the photo with the title and full name under it (E4, Q4). */}
      {leaderCards.some((card) => card.imageUrl || card.printed) && (
        <section className="flex flex-wrap justify-center gap-12 my-6">
          {leaderCards.map((card) => (
            <figure key={card.role} className="text-center">
              {card.imageUrl && (
                <StoredPhoto src={card.imageUrl} alt={card.printed ? `${card.printed}, ${card.label}` : card.label} className="h-32 w-48 object-contain rounded-md mx-auto shadow-sm" />
              )}
              <figcaption className="mt-3">
                {card.printed && <span className="block font-semibold">{card.printed}</span>}
                <span className={card.printed ? "text-sm text-muted-foreground" : "font-semibold text-lg"}>{card.label}</span>
              </figcaption>
            </figure>
          ))}
        </section>
      )}

      {/* Staff Directory */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          STAFF DIRECTORY
        </h2>

        {academicStaff.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Academic Staff</h3>
            <table className="w-full border-collapse border text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left w-10">S/N</th>
                  <th className="border p-2 text-left w-1/4">Name</th>
                  <th className="border p-2 text-left w-1/5">Rank/Designation</th>
                  <th className="border p-2 text-left w-1/5">
                    Highest Qualification
                  </th>
                  <th className="border p-2 text-left w-1/5">
                    Area of Specialization
                  </th>
                </tr>
              </thead>
              <tbody>
                {academicStaff.map((s, i) => (
                  <tr key={s.id}>
                    <td className="border p-2">{i + 1}</td>
                    <td className="border p-2 uppercase">{s.fullName}</td>
                    <td className="border p-2">{s.rank}</td>
                    <td className="border p-2">{s.qualification}</td>
                    <td className="border p-2">{s.specialization || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {adjunctStaff.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Adjunct Academic Staff</h3>
            <table className="w-full border-collapse border text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">S/N</th>
                  <th className="border p-2 text-left">Name</th>
                  <th className="border p-2 text-left">Rank/Designation</th>
                  <th className="border p-2 text-left">
                    Highest Qualification
                  </th>
                  <th className="border p-2 text-left">
                    Area of Specialization
                  </th>
                </tr>
              </thead>
              <tbody>
                {adjunctStaff.map((s, i) => (
                  <tr key={s.id}>
                    <td className="border p-2">{i + 1}</td>
                    <td className="border p-2 uppercase">{s.fullName}</td>
                    <td className="border p-2">{s.rank}</td>
                    <td className="border p-2">{s.qualification}</td>
                    <td className="border p-2">{s.specialization || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nonAcademicStaff.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Non-Academic Staff</h3>
            <table className="w-full border-collapse border text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left w-10">S/N</th>
                  <th className="border p-2 text-left w-2/5">Name</th>
                  <th className="border p-2 text-left w-2/5">Rank/Designation</th>
                </tr>
              </thead>
              <tbody>
                {nonAcademicStaff.map((s, i) => (
                  <tr key={s.id}>
                    <td className="border p-2">{i + 1}</td>
                    <td className="border p-2 uppercase">{s.fullName}</td>
                    <td className="border p-2">{s.rank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator />

      {/* W14 and Q5: the department's vision, mission and philosophy, in that order, then the objectives and unique features. */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          VISION, MISSION, PHILOSOPHY AND OBJECTIVES
        </h2>

        {programme.content?.vision && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Vision</h3>
            <p className="text-justify">{programme.content.vision}</p>
          </div>
        )}

        {programme.content?.mission && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Mission</h3>
            <p className="text-justify">{programme.content.mission}</p>
          </div>
        )}

        {programme.content?.philosophy && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Philosophy</h3>
            <p className="text-justify">{programme.content.philosophy}</p>
          </div>
        )}

        {programme.content?.objectives &&
          programme.content.objectives.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Objectives</h3>
              <p className="mb-2">
                The specific objectives of the programme are to:
              </p>
              <ul className="list-disc list-inside space-y-1">
                {programme.content.objectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
          )}

        {programme.content?.uniqueFeatures && programme.content.uniqueFeatures.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Unique Features</h3>
            <ul className="list-disc list-inside space-y-1">
              {programme.content.uniqueFeatures.map((feature, i) => (
                <li key={i}>{feature}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Separator />

      {/* Admission Requirements */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          ADMISSION REQUIREMENTS
        </h2>

        {programme.content?.utmeRequirements && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">UTME Entry Requirements</h3>
            <p className="text-justify">{programme.content.utmeRequirements}</p>
          </div>
        )}

        {programme.content?.directEntryRequirements && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Direct Entry Requirements</h3>
            <p className="text-justify">
              {programme.content.directEntryRequirements}
            </p>
          </div>
        )}

        {programme.content?.transferRequirements && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">
              Inter-University Transfer Requirements
            </h3>
            <p className="text-justify">
              {programme.content.transferRequirements}
            </p>
          </div>
        )}
      </section>

      <Separator />

      {/* Graduation Requirements */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          GRADUATION REQUIREMENTS
        </h2>

        {programme.content?.graduationRequirements && (
          <p className="mb-4">{programme.content.graduationRequirements}</p>
        )}

        {/* W5: the graduation numbers and W4: the credit summary, built by the app. */}
        {numbersLine && <p className="mb-4">{numbersLine}</p>}
        <div className="mt-4 mb-6">
          <h3 className="font-semibold mb-2">Credit Summary</h3>
          <CreditSummaryTable summary={credits} />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          {programme.content?.minimumCGPA !== undefined && (
            <div className="bg-muted p-3 rounded">
              <span className="font-medium">Minimum CGPA:</span>{" "}
              {programme.content.minimumCGPA}
            </div>
          )}
          <div className="bg-muted p-3 rounded">
            <span className="font-medium">Minimum Credits to Graduate:</span>{" "}
            {credits.totals.total}
          </div>
        </div>
      </section>

      <Separator />

      {/* Course Structure */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          COURSE STRUCTURE
        </h2>

        {Object.entries(groupedCourses)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([level, semesters]) => (
            <div key={level} className="mb-6">
              <h3 className="font-semibold mb-3">{level} Level</h3>

              {(
                [
                  ["First Semester", semesters.sem1],
                  ["Second Semester", semesters.sem2],
                  ["Sessional (no semester)", semesters.sessional],
                ] as const
              ).map(([label, courses]) =>
                courses.length > 0 && (
                  <div key={label} className="mb-4">
                    <h4 className="font-medium mb-2 text-muted-foreground">
                      {label}
                    </h4>
                    <table className="w-full border-collapse border text-xs">
                      <thead>
                        <tr className="bg-muted">
                          <th className="border p-2 text-left">S/N</th>
                          <th className="border p-2 text-left">Course Code</th>
                          <th className="border p-2 text-left">Course Title</th>
                          <th className="border p-2 text-center">Units</th>
                          <th className="border p-2 text-center">Status</th>
                          <th className="border p-2 text-center">
                            Prerequisites
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {courses.map((course, i) => (
                          <tr key={course.code}>
                            <td className="border p-2">{i + 1}</td>
                            <td className="border p-2">{course.code}</td>
                            <td className="border p-2">{course.title}</td>
                            <td className="border p-2 text-center">
                              {course.units}
                            </td>
                            <td className="border p-2 text-center">
                              {course.status === "CORE" ? "C" : "E"}
                            </td>
                            <td className="border p-2 text-center">
                              {course.prerequisites || "-"}
                            </td>
                          </tr>
                        ))}
                        <tr className="font-semibold bg-muted">
                          <td colSpan={3} className="border p-2 text-right">
                            Total Units:
                          </td>
                          <td className="border p-2 text-center">
                            {courses.reduce((sum, c) => sum + c.units, 0)}
                          </td>
                          <td className="border p-2" colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ),
              )}
            </div>
          ))}
      </section>

      <Separator />

      {/* Course Details (Course Descriptions) */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          COURSE DESCRIPTIONS
        </h2>
        <div className="space-y-4">
          {programme.courses
            .sort((a, b) => a.code.localeCompare(b.code))
            .filter((c) => c.description?.courseContent || (c.description?.learningOutcomes && c.description.learningOutcomes.length > 0))
            .map((course) => (
              <div key={course.code} className="mb-4">
                {/* W15: the heading line, the lead-in, the outcomes, then the content. */}
                <h3 className="font-semibold">{courseHeading(course)}</h3>
                {course.description?.learningOutcomes && course.description.learningOutcomes.length > 0 && (
                  <div className="mt-2 text-sm">
                    <p className="font-medium">{OUTCOMES_LEAD}</p>
                    <ol className="mt-1 list-decimal list-inside">
                      {course.description.learningOutcomes.map((outcome, i) => (
                        <li key={i}>{outcome}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {course.description?.courseContent && (
                  // Plain text, exactly as the Word and PDF exports print it.
                  <p className="mt-2 text-sm whitespace-pre-line">
                    {cleanText(course.description.courseContent)}
                  </p>
                )}
              </div>
            ))}
          {programme.courses.filter((c) => c.description?.courseContent || (c.description?.learningOutcomes && c.description.learningOutcomes.length > 0)).length === 0 && (
            <p className="text-muted-foreground italic">No course descriptions provided.</p>
          )}
        </div>
      </section>

      {/* Employability Skills */}
      {programme.content?.employability &&
        programme.content.employability.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3 border-b pb-1">
              EMPLOYABILITY SKILLS
            </h2>
            <ul className="list-disc list-inside space-y-1">
              {programme.content.employability.map((skill, i) => (
                <li key={i}>{skill}</li>
              ))}
            </ul>
          </section>
        )}

      <Separator />

      {/* Regulations & Changes */}
      {(programme.content?.sectionF?.content || programme.content?.sectionG?.content) && (
        <section>
          <h2 className="text-lg font-bold mb-3 border-b pb-1">
            REGULATIONS & SUMMARY OF CHANGES
          </h2>

          {programme.content?.sectionF?.content && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Programme Regulations</h3>
              <SafeRichText className="prose prose-sm max-w-none" html={programme.content.sectionF.content} />
            </div>
          )}

          {programme.content?.sectionG?.content && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Summary of Changes</h3>
              <SafeRichText className="prose prose-sm max-w-none" html={programme.content.sectionG.content} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
