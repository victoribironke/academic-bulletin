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
import { Loader2, Eye, Printer, Download, FileText } from "lucide-react";
import { BulletinData } from "@/lib/bulletin/generation";
import { BulletinProgrammeView } from "@/components/preview/bulletin-programme-view";

interface Submission {
  id: string;
  title: string;
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
  departmentId?: string;
}

export function BulletinPreview({ submission }: BulletinPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<BulletinData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        level: "department",
        programmeId: submission.programme.id,
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
  }, [submission.id, submission.programme.id]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = async (format: "docx" | "pdf") => {
    setExportingFormat(format);
    try {
      const params = new URLSearchParams({
        submissionId: submission.id,
        format,
      });

      const response = await fetch(`/api/bulletin/export?${params}`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${submission.title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}_Bulletin.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Failed to export ${format}:`, error);
      alert(`Failed to export as ${format.toUpperCase()}. Please try again.`);
    } finally {
      setExportingFormat(null);
    }
  };

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
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("docx")}
                disabled={exportingFormat !== null}
              >
                {exportingFormat === "docx" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-1" />
                )}
                Export Word
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("pdf")}
                disabled={exportingFormat !== null}
              >
                {exportingFormat === "pdf" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
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
                <BulletinProgrammeView programme={programmeData} />
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BulletinPreview;
