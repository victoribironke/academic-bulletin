"use client";

import { useState, useEffect } from "react";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/programmes"), fetch("/api/schools"), fetch("/api/cycles")])
      .then(([programmesRes, schoolsRes, cyclesRes]) =>
        Promise.all([
          programmesRes.ok ? programmesRes.json() : [],
          schoolsRes.ok ? schoolsRes.json() : [],
          cyclesRes.ok ? cyclesRes.json() : [],
        ]),
      )
      .then(([programmeData, schoolData, cycleData]) => {
        if (cancelled) return;
        setProgrammes(programmeData);
        setSchools(schoolData);
        setActiveCycle(
          (cycleData as { id: string; name: string; isActive: boolean }[]).find(
            (c) => c.isActive,
          ) ?? null,
        );
      })
      .catch((err) => console.error("Failed to fetch data:", err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Picking a programme fills in a suggested title.
  const selectProgramme = (programmeId: string) => {
    const programme = programmes.find((p) => p.id === programmeId);
    setFormData({
      programmeId,
      title: programme ? `${programme.name} - Academic Bulletin` : formData.title,
    });
  };

  // Changing the school filter clears a programme from another school.
  const selectSchool = (schoolId: string) => {
    setFilterSchoolId(schoolId);
    setFormData((prev) => ({ ...prev, programmeId: "" }));
  };

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
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-72 animate-pulse rounded-lg border bg-card" />
      </div>
    );
  }

  if (!activeCycle) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No review cycle is active"
        description="An administrator needs to start a review cycle before submissions can be created."
        action={
          <Button asChild variant="outline">
            <Link href="/submissions">Back to submissions</Link>
          </Button>
        }
        className="mx-auto mt-8 max-w-2xl"
      />
    );
  }

  if (!currentUser) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New submission"
        description={`Start a bulletin submission for a programme in ${activeCycle.name}.`}
        actions={
          <Button asChild variant="outline">
            <Link href="/submissions">
              <ArrowLeft />
              Back
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" />
            Submission details
          </CardTitle>
          <CardDescription>
            Choose the programme. You can fill in the content after it&apos;s created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* School Filter */}
            <div className="grid gap-2">
              <Label htmlFor="school">Filter by School (optional)</Label>
              <Select value={filterSchoolId} onValueChange={selectSchool}>
                <SelectTrigger id="school" className="w-full">
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
                onValueChange={selectProgramme}
              >
                <SelectTrigger id="programme" className="w-full">
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
              <Button asChild type="button" variant="outline">
                <Link href="/submissions">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                Create submission
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mt-4 rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">What happens next</p>
        <ol className="list-inside list-decimal space-y-1">
          <li>A draft submission is created for the programme.</li>
          <li>You&apos;re taken to it to fill in each section.</li>
          <li>Your work is saved as a draft until you submit it for review.</li>
        </ol>
      </div>
    </div>
  );
}
