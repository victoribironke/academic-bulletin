"use client";

import React from "react";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulletinProgramme, BulletinCourse } from "@/lib/bulletin/generation";

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

  // Helper to group courses
  const groupedCourses = programme.courses.reduce(
    (acc, course) => {
      if (!acc[course.level]) acc[course.level] = { sem1: [], sem2: [] };
      if (course.semester === 1) {
        acc[course.level].sem1.push(course);
      } else {
        acc[course.level].sem2.push(course);
      }
      return acc;
    },
    {} as Record<number, { sem1: BulletinCourse[]; sem2: BulletinCourse[] }>,
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
          Department of {programme.department}
        </h2>
        <h3 className="text-lg font-medium">{programme.name}</h3>
      </div>

      <Separator />

      {/* Deans & HODs Profile */}
      {(programme.content?.deanImageUrl || programme.content?.hodImageUrl) && (
        <section className="flex justify-center gap-12 my-6">
          {programme.content.deanImageUrl && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={programme.content.deanImageUrl} alt="Dean" className="h-32 w-48 object-contain rounded-md mx-auto shadow-sm" />
              <p className="mt-3 font-semibold text-lg">Dean</p>
            </div>
          )}
          {programme.content.hodImageUrl && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={programme.content.hodImageUrl} alt="Head of Department" className="h-32 w-48 object-contain rounded-md mx-auto shadow-sm" />
              <p className="mt-3 font-semibold text-lg">Head of Department</p>
            </div>
          )}
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

      {/* Programme Philosophy */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          PHILOSOPHY AND OBJECTIVES
        </h2>

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

        <div className="mt-4 mb-6">
          <h3 className="font-semibold mb-2">Credit Requirements Summary</h3>
          <div className="overflow-x-auto text-sm">
            <Table className="border w-full">
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="w-1/4">Level</TableHead>
                  <TableHead className="w-1/4">Core Units</TableHead>
                  <TableHead className="w-1/4">Elective Units</TableHead>
                  <TableHead className="w-1/4">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(new Set(programme.courses.map(c => c.level)))
                  .sort()
                  .map(level => {
                    const courses = programme.courses.filter(c => c.level === level);
                    const core = courses.filter(c => c.status === "CORE" || c.status === "MANDATORY").reduce((acc, c) => acc + c.units, 0);
                    const elective = courses.filter(c => c.status === "ELECTIVE").reduce((acc, c) => acc + c.units, 0);
                    return (
                      <TableRow key={level}>
                        <TableCell className="font-medium">{level}</TableCell>
                        <TableCell>{core}</TableCell>
                        <TableCell>{elective}</TableCell>
                        <TableCell className="font-semibold">{core + elective}</TableCell>
                      </TableRow>
                    );
                  })}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold">Total Requirements</TableCell>
                  <TableCell className="font-bold">
                    {programme.courses.filter(c => c.status === "CORE" || c.status === "MANDATORY").reduce((acc, c) => acc + c.units, 0)}
                  </TableCell>
                  <TableCell className="font-bold">
                    {programme.courses.filter(c => c.status === "ELECTIVE").reduce((acc, c) => acc + c.units, 0)}
                  </TableCell>
                  <TableCell className="text-base font-semibold text-foreground">
                    {programme.courses.reduce((sum, c) => sum + c.units, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          {programme.content?.minimumCGPA !== undefined && (
            <div className="bg-muted p-3 rounded">
              <span className="font-medium">Minimum CGPA:</span>{" "}
              {programme.content.minimumCGPA}
            </div>
          )}
          <div className="bg-muted p-3 rounded">
            <span className="font-medium">Total Credit Units Expected:</span>{" "}
            {programme.content?.totalUnits || programme.courses.reduce((sum, c) => sum + c.units, 0)}
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

              {/* First Semester */}
              {semesters.sem1.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-muted-foreground">
                    First Semester
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
                      {semesters.sem1.map((course, i) => (
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
                          {semesters.sem1.reduce((sum, c) => sum + c.units, 0)}
                        </td>
                        <td className="border p-2" colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Second Semester */}
              {semesters.sem2.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-muted-foreground">
                    Second Semester
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
                      {semesters.sem2.map((course, i) => (
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
                          {semesters.sem2.reduce((sum, c) => sum + c.units, 0)}
                        </td>
                        <td className="border p-2" colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
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
                <h3 className="font-semibold">{course.code} - {course.title} ({course.units} Units)</h3>
                {course.description?.courseContent && (
                  <div className="mt-1 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: course.description.courseContent }} />
                )}
                {course.description?.learningOutcomes && course.description.learningOutcomes.length > 0 && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <strong>Learning Outcomes:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {course.description.learningOutcomes.map((outcome, i) => (
                        <li key={i}>{outcome}</li>
                      ))}
                    </ul>
                  </div>
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
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: programme.content.sectionF.content }} />
            </div>
          )}

          {programme.content?.sectionG?.content && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Summary of Changes</h3>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: programme.content.sectionG.content }} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
