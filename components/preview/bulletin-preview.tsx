"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Eye, Printer, Download } from "lucide-react";
import {
  BulletinData,
} from "@/lib/bulletin/generation";
import { BulletinProgrammeView } from "@/components/preview/bulletin-programme-view";

interface Submission {
  id: string;
  title: string;
  academicYear: string;
  programme: {
    id: string;
    name: string;
    code: string;
    degreeType?: string;
    duration?: number;
    department: {
      id: string;
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
  // departmentId prop is no longer needed but kept for compatibility if passed
  departmentId?: string;
}

export function BulletinPreview({ submission }: BulletinPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<BulletinData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        level: "department",
        programmeId: submission.programme.id,
        academicYear: submission.academicYear,
        submissionId: submission.id,
      });

      const response = await fetch(`/api/bulletin/generate?${params}`);

      if (!response.ok) {
        throw new Error("Failed to generate preview");
      }

      const result: BulletinData = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch preview data:", error);
      setError("Failed to load preview. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [submission.id, submission.programme.id, submission.academicYear]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handlePrint = () => {
    window.print();
  };

  // Helper to group courses if data is loaded
  // const getGroupedCourses = (courses: BulletinCourse[]) => {
  //   return courses.reduce(
  //     (acc, course) => {
  //       if (!acc[course.level]) acc[course.level] = { sem1: [], sem2: [] };
  //       if (course.semester === 1) {
  //         acc[course.level].sem1.push(course);
  //       } else {
  //         acc[course.level].sem2.push(course);
  //       }
  //       return acc;
  //     },
  //     {} as Record<number, { sem1: BulletinCourse[]; sem2: BulletinCourse[] }>,
  //   );
  // };

  if (!data && !isLoading && isOpen && error) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Eye className="h-4 w-4 mr-2" />
            Preview Bulletin
          </Button>
        </DialogTrigger>
        <DialogContent>
          <div className="p-4 text-center text-red-500">{error}</div>
        </DialogContent>
      </Dialog>
    );
  }

  const programmeData = data?.programmes[0];
  // const academicStaff =
  //   programmeData?.staff.filter((s) => s.type === "ACADEMIC") || [];
  // const adjunctStaff =
  //   programmeData?.staff.filter((s) => s.type === "ADJUNCT") || [];
  // const nonAcademicStaff =
  //   programmeData?.staff.filter((s) => s.type === "NON_ACADEMIC") || [];
  // const groupedCourses = programmeData
  //   ? getGroupedCourses(programmeData.courses)
  //   : {};

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

        {isLoading || !programmeData ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="h-[70vh] pr-4">
            <div id="bulletin-preview">
              {programmeData && (
                <BulletinProgrammeView
                  programme={programmeData}
                  academicYear={data?.academicYear || ""}
                />
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BulletinPreview;
