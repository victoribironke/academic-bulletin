"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Printer, Download, BookOpen } from "lucide-react";
import { BulletinData } from "@/lib/bulletin/generation";
import { BulletinProgrammeView } from "@/components/preview/bulletin-programme-view";

interface School {
  id: string;
  name: string;
  code: string;
}

export function BulletinGenerator() {
  const [level, setLevel] = useState<"school" | "institution">("school");
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedData, setGeneratedData] = useState<BulletinData | null>(null);

  useEffect(() => {
    // Fetch schools
    const fetchSchools = async () => {
      try {
        const res = await fetch("/api/schools");
        if (res.ok) {
          const data = await res.json();
          setSchools(data);
        }
      } catch (error) {
        console.error("Failed to fetch schools", error);
        toast.error("Failed to load schools.");
      }
    };

    fetchSchools();
  }, []);

  const handleGenerate = async () => {
    if (level === "school" && !selectedSchoolId) {
      toast.error("Please select a school.");
      return;
    }

    setIsLoading(true);
    setGeneratedData(null);

    try {
      const params = new URLSearchParams({
        level,
      });

      if (level === "school") {
        params.append("schoolId", selectedSchoolId);
      }

      const res = await fetch(`/api/bulletin/generate?${params}`);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate bulletin");
      }

      const data: BulletinData = await res.json();
      setGeneratedData(data);
      toast.success(
        `Bulletin generated successfully. Loaded ${data.programmes.length} programmes.`,
      );
    } catch (error) {
      console.error("Generation error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate bulletin.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* Controls - Hidden when printing */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Bulletin Generator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Report Level</Label>
              <Select
                value={level}
                onValueChange={(v: "school" | "institution") => setLevel(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">School Level</SelectItem>
                  <SelectItem value="institution">Institution (All)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {level === "school" && (
              <div className="space-y-2">
                <Label>School</Label>
                <Select
                  value={selectedSchoolId}
                  onValueChange={setSelectedSchoolId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select School" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Bulletin"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {generatedData && (
        <div className="flex justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save as PDF
          </Button>
          <Button variant="outline" disabled>
            <Download className="mr-2 h-4 w-4" />
            Export Raw Data
          </Button>
        </div>
      )}

      {/* Generated Content */}
      {generatedData && (
        <div className="bg-white p-8 min-h-screen shadow-sm print:shadow-none print:p-0">
          {/* Cover Page Idea? For now just title */}
          <div
            className="text-center mb-12 hidden print:block"
            style={{ breakAfter: "page" }}
          >
            <h1 className="text-4xl font-bold mb-4 uppercase">
              {generatedData.title}
            </h1>
            <p className="text-2xl">Academic Bulletin</p>
            <p className="text-sm text-muted-foreground mt-8">
              Generated on{" "}
              {new Date(generatedData.generatedAt).toLocaleDateString()}
            </p>
          </div>

          <div className="print:hidden mb-8 border-b pb-4">
            <h2 className="text-2xl font-bold">
              {generatedData.title} Preview
            </h2>
            <p className="text-muted-foreground">
              Displaying {generatedData.summary.totalProgrammes} programmes,{" "}
              {generatedData.summary.totalCourses} courses,{" "}
              {generatedData.summary.totalStaff} staff.
            </p>
          </div>

          <div>
            {generatedData.programmes.map((prog, idx) => (
              <div key={prog.id || idx}>
                <BulletinProgrammeView programme={prog} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
