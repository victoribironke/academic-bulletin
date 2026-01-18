"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, Printer, Download } from "lucide-react";

interface Staff {
  id: string;
  name: string;
  position: string;
  specialization?: string;
  email?: string;
  type: "ACADEMIC" | "ADJUNCT" | "NON_ACADEMIC";
}

interface Course {
  id: string;
  code: string;
  title: string;
  units: number;
  status: "CORE" | "ELECTIVE";
  semester: number;
  level: number;
  lecturer?: {
    name: string;
  };
  description?: {
    learningOutcomes: string[];
    courseContent: string;
    labWork?: string;
  };
}

interface Submission {
  id: string;
  title: string;
  academicYear: string;
  programme: {
    name: string;
    code: string;
    degreeType?: string;
    duration?: number;
    department: {
      name: string;
      school: { name: string };
    };
  };
  content?: {
    philosophy?: string;
    objectives?: string[];
    uniqueFeatures?: string[];
    employability?: string;
    utmeRequirements?: string;
    directEntryRequirements?: string;
    transferRequirements?: string;
    minimumDuration?: string;
    graduationRequirements?: string;
    minimumCGPA?: number;
    totalUnits?: number;
  } | null;
}

interface BulletinPreviewProps {
  submission: Submission;
  departmentId: string;
}

export function BulletinPreview({
  submission,
  departmentId,
}: BulletinPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [staffRes, coursesRes] = await Promise.all([
        fetch(`/api/staff?departmentId=${departmentId}`),
        fetch(`/api/courses?submissionId=${submission.id}`),
      ]);

      if (staffRes.ok) setStaff(await staffRes.json());
      if (coursesRes.ok) setCourses(await coursesRes.json());
    } catch (error) {
      console.error("Failed to fetch preview data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, submission.id]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const groupedCourses = courses.reduce(
    (acc, course) => {
      if (!acc[course.level]) acc[course.level] = { sem1: [], sem2: [] };
      if (course.semester === 1) {
        acc[course.level].sem1.push(course);
      } else {
        acc[course.level].sem2.push(course);
      }
      return acc;
    },
    {} as Record<number, { sem1: Course[]; sem2: Course[] }>,
  );

  const academicStaff = staff.filter((s) => s.type === "ACADEMIC");
  const adjunctStaff = staff.filter((s) => s.type === "ADJUNCT");
  const nonAcademicStaff = staff.filter((s) => s.type === "NON_ACADEMIC");

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Eye className="h-4 w-4 mr-2" />
          Preview Bulletin
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Bulletin Preview</DialogTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-1" />
                Export PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="h-[70vh] pr-4">
            <div
              className="space-y-6 text-sm print:text-xs"
              id="bulletin-preview"
            >
              {/* Header */}
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">
                  {submission.programme.department.school.name.toUpperCase()}
                </h1>
                <h2 className="text-xl font-semibold">
                  Department of {submission.programme.department.name}
                </h2>
                <h3 className="text-lg font-medium">
                  {submission.programme.name}
                </h3>
                <Badge variant="outline" className="text-base">
                  {submission.academicYear} Academic Session
                </Badge>
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
                          <th className="border p-2 text-left">
                            Rank/Designation
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
                            <td className="border p-2">{s.name}</td>
                            <td className="border p-2">{s.position}</td>
                            <td className="border p-2">
                              {s.specialization || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {adjunctStaff.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Adjunct Staff</h3>
                    <table className="w-full border-collapse border text-xs">
                      <thead>
                        <tr className="bg-muted">
                          <th className="border p-2 text-left">S/N</th>
                          <th className="border p-2 text-left">Name</th>
                          <th className="border p-2 text-left">
                            Rank/Designation
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
                            <td className="border p-2">{s.name}</td>
                            <td className="border p-2">{s.position}</td>
                            <td className="border p-2">
                              {s.specialization || "-"}
                            </td>
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
                          <th className="border p-2 text-left">
                            Rank/Designation
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {nonAcademicStaff.map((s, i) => (
                          <tr key={s.id}>
                            <td className="border p-2">{i + 1}</td>
                            <td className="border p-2">{s.name}</td>
                            <td className="border p-2">{s.position}</td>
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

                {submission.content?.philosophy && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Philosophy</h3>
                    <p className="text-justify">
                      {submission.content.philosophy}
                    </p>
                  </div>
                )}

                {submission.content?.objectives &&
                  submission.content.objectives.length > 0 && (
                    <div className="mb-4">
                      <h3 className="font-semibold mb-2">Objectives</h3>
                      <p className="mb-2">
                        The specific objectives of the programme are to:
                      </p>
                      <ol className="list-decimal list-inside space-y-1">
                        {submission.content.objectives.map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                {submission.content?.uniqueFeatures &&
                  submission.content.uniqueFeatures.length > 0 && (
                    <div className="mb-4">
                      <h3 className="font-semibold mb-2">Unique Features</h3>
                      <ol className="list-decimal list-inside space-y-1">
                        {submission.content.uniqueFeatures.map((feature, i) => (
                          <li key={i}>{feature}</li>
                        ))}
                      </ol>
                    </div>
                  )}
              </section>

              <Separator />

              {/* Admission Requirements */}
              <section>
                <h2 className="text-lg font-bold mb-3 border-b pb-1">
                  ADMISSION REQUIREMENTS
                </h2>

                {submission.content?.utmeRequirements && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">UTME Mode</h3>
                    <p>{submission.content.utmeRequirements}</p>
                  </div>
                )}

                {submission.content?.directEntryRequirements && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Direct Entry Mode</h3>
                    <p>{submission.content.directEntryRequirements}</p>
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
                                <th className="border p-2 text-left">
                                  Course Code
                                </th>
                                <th className="border p-2 text-left">
                                  Course Title
                                </th>
                                <th className="border p-2 text-center">
                                  Units
                                </th>
                                <th className="border p-2 text-center">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {semesters.sem1.map((course, i) => (
                                <tr key={course.id}>
                                  <td className="border p-2">{i + 1}</td>
                                  <td className="border p-2">{course.code}</td>
                                  <td className="border p-2">{course.title}</td>
                                  <td className="border p-2 text-center">
                                    {course.units}
                                  </td>
                                  <td className="border p-2 text-center">
                                    {course.status === "CORE" ? "C" : "E"}
                                  </td>
                                </tr>
                              ))}
                              <tr className="font-semibold bg-muted">
                                <td
                                  colSpan={3}
                                  className="border p-2 text-right"
                                >
                                  Total Units:
                                </td>
                                <td className="border p-2 text-center">
                                  {semesters.sem1.reduce(
                                    (sum, c) => sum + c.units,
                                    0,
                                  )}
                                </td>
                                <td className="border p-2"></td>
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
                                <th className="border p-2 text-left">
                                  Course Code
                                </th>
                                <th className="border p-2 text-left">
                                  Course Title
                                </th>
                                <th className="border p-2 text-center">
                                  Units
                                </th>
                                <th className="border p-2 text-center">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {semesters.sem2.map((course, i) => (
                                <tr key={course.id}>
                                  <td className="border p-2">{i + 1}</td>
                                  <td className="border p-2">{course.code}</td>
                                  <td className="border p-2">{course.title}</td>
                                  <td className="border p-2 text-center">
                                    {course.units}
                                  </td>
                                  <td className="border p-2 text-center">
                                    {course.status === "CORE" ? "C" : "E"}
                                  </td>
                                </tr>
                              ))}
                              <tr className="font-semibold bg-muted">
                                <td
                                  colSpan={3}
                                  className="border p-2 text-right"
                                >
                                  Total Units:
                                </td>
                                <td className="border p-2 text-center">
                                  {semesters.sem2.reduce(
                                    (sum, c) => sum + c.units,
                                    0,
                                  )}
                                </td>
                                <td className="border p-2"></td>
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

                {submission.content?.graduationRequirements && (
                  <p className="mb-4">
                    {submission.content.graduationRequirements}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-muted p-3 rounded">
                    <span className="font-medium">Minimum CGPA:</span>{" "}
                    {submission.content?.minimumCGPA || "2.50"}
                  </div>
                  <div className="bg-muted p-3 rounded">
                    <span className="font-medium">Total Credit Units:</span>{" "}
                    {submission.content?.totalUnits ||
                      courses.reduce((sum, c) => sum + c.units, 0)}
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BulletinPreview;
