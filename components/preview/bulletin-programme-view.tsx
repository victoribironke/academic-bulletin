"use client";

import React from "react";
import { Separator } from "@/components/ui/separator";
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
                  <th className="border p-2 text-left">S/N</th>
                  <th className="border p-2 text-left">Name</th>
                  <th className="border p-2 text-left">Rank/Designation</th>
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

      {/* Graduation Requirements */}
      <section>
        <h2 className="text-lg font-bold mb-3 border-b pb-1">
          GRADUATION REQUIREMENTS
        </h2>

        {programme.content?.graduationRequirements && (
          <p className="mb-4">{programme.content.graduationRequirements}</p>
        )}

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-muted p-3 rounded">
            <span className="font-medium">Total Credit Units:</span>{" "}
            {programme.courses.reduce((sum, c) => sum + c.units, 0)}
          </div>
        </div>
      </section>
    </div>
  );
}
