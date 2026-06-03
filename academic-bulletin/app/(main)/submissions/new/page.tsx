"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

interface School {
  id: string;
  name: string;
  code: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
  school: School;
}

interface Programme {
  id: string;
  name: string;
  code: string;
  department: Department;
}

export default function NewSubmissionPage() {
  const router = useRouter();
  const { currentUser } = useUser();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeCycle, setActiveCycle] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    programmeId: "",
    title: "",
  });

  const [filterSchoolId, setFilterSchoolId] = useState<string>("all");

  const fetchData = async () => {
    try {
      const [programmesRes, schoolsRes, cyclesRes] = await Promise.all([
        fetch("/api/programmes"),
        fetch("/api/schools"),
        fetch("/api/cycles"),
      ]);

      if (programmesRes.ok) {
        const data = await programmesRes.json();
        setProgrammes(data);
      }
      if (schoolsRes.ok) {
        const data = await schoolsRes.json();
        setSchools(data);
      }
      if (cyclesRes.ok) {
        const data = await cyclesRes.json();
        const active = data.find(
          (c: { id: string; name: string; isActive: boolean }) => c.isActive,
        );
        setActiveCycle(active || null);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-generate title when programme and year are selected
  useEffect(() => {
    if (formData.programmeId) {
      const programme = programmes.find((p) => p.id === formData.programmeId);
      if (programme) {
        setFormData((prev) => ({
          ...prev,
          title: `${programme.name} - Academic Bulletin`,
        }));
      }
    }
  }, [formData.programmeId, programmes]);

  // Reset programme selection when school filter changes
  useEffect(() => {
    setFormData((prev) => ({ ...prev, programmeId: "" }));
  }, [filterSchoolId]);

  const filteredProgrammes =
    filterSchoolId === "all"
      ? programmes
      : programmes.filter((p) => p.department.school.id === filterSchoolId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentUser) {
      setError("You must be logged in to create a submission");
      return;
    }

    if (!activeCycle) {
      setError("No active review cycle found. An admin must create one.");
      return;
    }

    if (!formData.programmeId) {
      setError("Please select a programme");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          createdById: currentUser.id,
          cycleId: activeCycle.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to create submission");
        return;
      }

      const submission = await response.json();
      router.push(`/submissions/${submission.id}`);
    } catch (err) {
      console.error("Failed to create submission:", err);
      setError("Failed to create submission");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!activeCycle) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-destructive">
              No Active Review Cycle
            </CardTitle>
            <CardDescription>
              An administrator must create and start a new Review Cycle before
              any submissions can be created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/submissions">
              <Button variant="outline" className="w-full">
                Back to Submissions
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Not Logged In</CardTitle>
            <CardDescription>
              Please select a user from the header to create a submission.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/submissions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Submission</h1>
          <p className="text-muted-foreground">
            Create a new academic bulletin submission
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Submission Details
          </CardTitle>
          <CardDescription>
            Select the programme for this submission. You can edit the content
            after creating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
                {error}
              </div>
            )}

            {/* School Filter */}
            <div className="grid gap-2">
              <Label htmlFor="school">Filter by School (optional)</Label>
              <Select value={filterSchoolId} onValueChange={setFilterSchoolId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Schools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name} ({school.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Programme Selection */}
            <div className="grid gap-2">
              <Label htmlFor="programme">
                Programme <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.programmeId}
                onValueChange={(value) =>
                  setFormData({ ...formData, programmeId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a programme" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProgrammes.map((prog) => (
                    <SelectItem key={prog.id} value={prog.id}>
                      <div className="flex flex-col">
                        <span>{prog.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {prog.department.name} - {prog.department.school.code}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title (auto-generated) */}
            <div className="grid gap-2">
              <Label htmlFor="title">Submission Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Auto-generated based on selection"
              />
              <p className="text-xs text-muted-foreground">
                This title is auto-generated but can be edited.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3">
              <Link href="/submissions">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Submission
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>What happens next?</strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>A new draft submission will be created for this programme</li>
              <li>
                You&apos;ll be redirected to the editor to fill in sections A-H
              </li>
              <li>Save your progress at any time as a draft</li>
              <li>Submit for review when all required sections are complete</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
