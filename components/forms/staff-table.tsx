"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DynamicTable, Column } from "./dynamic-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Users } from "lucide-react";

// Updated StaffMember interface with new structured fields
interface StaffMember {
  [key: string]: unknown;
  id?: string;
  title: string;
  gender: string;
  surname: string;
  middleName: string;
  firstName: string;
  highestQualification: string;
  academicRank: string;
  specialization: string;
  email: string;
  type: "ACADEMIC" | "ADJUNCT" | "NON_ACADEMIC";
  isNew?: boolean;
  fullName?: string; // Computed from API
}

interface StaffTableProps {
  departmentId: string;
  disabled?: boolean;
}

// Title options
const titleOptions = [
  { value: "MR", label: "Mr." },
  { value: "MRS", label: "Mrs." },
  { value: "MS", label: "Ms." },
  { value: "DR", label: "Dr." },
  { value: "PROF", label: "Prof." },
  { value: "ENGR", label: "Engr." },
  { value: "BARR", label: "Barr." },
  { value: "REV", label: "Rev." },
  { value: "PASTOR", label: "Pastor" },
];

// Gender options
const genderOptions = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

// Academic Qualification options
const qualificationOptions = [
  { value: "PHD", label: "Ph.D." },
  { value: "MASTERS", label: "Master's Degree" },
  { value: "BACHELOR", label: "Bachelor's Degree" },
  { value: "HND", label: "HND" },
  { value: "OND", label: "OND" },
];

// Academic Rank options
const rankOptions = [
  { value: "PROFESSOR", label: "Professor" },
  { value: "ASSOCIATE_PROFESSOR", label: "Associate Professor" },
  { value: "SENIOR_LECTURER", label: "Senior Lecturer" },
  { value: "LECTURER_I", label: "Lecturer I" },
  { value: "LECTURER_II", label: "Lecturer II" },
  { value: "ASSISTANT_LECTURER", label: "Assistant Lecturer" },
  { value: "GRADUATE_ASSISTANT", label: "Graduate Assistant" },
];

// Non-Academic Rank/Title options
const nonAcademicRankOptions = [
  { value: "LAB_TECHNOLOGIST", label: "Lab Technologist" },
  { value: "OFFICE_MANAGER", label: "Office Manager" },
  { value: "SECRETARY", label: "Secretary" },
  { value: "ADMINISTRATIVE_OFFICER", label: "Administrative Officer" },
  { value: "CLERICAL_OFFICER", label: "Clerical Officer" },
  { value: "TECHNICIAN", label: "Technician" },
  { value: "OTHER", label: "Other" },
];

// Academic staff columns with structured name fields
const academicColumns: Column<StaffMember>[] = [
  {
    key: "title",
    header: "Title",
    type: "select",
    options: titleOptions,
    required: true,
  },
  {
    key: "surname",
    header: "Surname",
    type: "text",
    placeholder: "e.g., Okonkwo",
    required: true,
  },
  {
    key: "firstName",
    header: "First Name",
    type: "text",
    placeholder: "e.g., Chidi",
    required: true,
  },
  {
    key: "middleName",
    header: "Middle Name",
    type: "text",
    placeholder: "Optional",
  },
  {
    key: "gender",
    header: "Gender",
    type: "select",
    options: genderOptions,
    required: true,
  },
  {
    key: "highestQualification",
    header: "Highest Academic Qualification",
    type: "select",
    options: qualificationOptions,
    required: true,
  },
  {
    key: "academicRank",
    header: "Rank",
    type: "select",
    options: rankOptions,
    required: true,
  },
  {
    key: "specialization",
    header: "Specialization",
    type: "text",
    placeholder: "e.g., Artificial Intelligence",
  },
  {
    key: "email",
    header: "Email",
    type: "text",
    placeholder: "e.g., name@babcock.edu.ng",
  },
];

// Non-academic staff columns (fewer required fields)
const nonAcademicColumns: Column<StaffMember>[] = [
  {
    key: "title",
    header: "Title",
    type: "select",
    options: titleOptions,
    required: true,
  },
  {
    key: "surname",
    header: "Surname",
    type: "text",
    placeholder: "e.g., Smith",
    required: true,
  },
  {
    key: "firstName",
    header: "First Name",
    type: "text",
    placeholder: "e.g., James",
    required: true,
  },
  {
    key: "gender",
    header: "Gender",
    type: "select",
    options: genderOptions,
    required: true,
  },
  {
    key: "highestQualification",
    header: "Highest Academic Qualification",
    type: "select",
    options: qualificationOptions,
    required: true,
  },
  {
    key: "academicRank", // Reusing this field for Job Title to match schema
    header: "Job Title",
    type: "select",
    options: nonAcademicRankOptions,
    required: true,
  },
  {
    key: "email",
    header: "Email",
    type: "text",
    placeholder: "e.g., name@babcock.edu.ng",
  },
];

export function StaffTable({
  departmentId,
  disabled = false,
}: StaffTableProps) {
  const [academicStaff, setAcademicStaff] = useState<StaffMember[]>([]);
  const [adjunctStaff, setAdjunctStaff] = useState<StaffMember[]>([]);
  const [nonAcademicStaff, setNonAcademicStaff] = useState<StaffMember[]>([]);
  const [originalStaffIds, setOriginalStaffIds] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("academic");

  const fetchStaff = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/staff?departmentId=${departmentId}`);
      if (!res.ok) throw new Error("Failed to fetch staff");

      const data = await res.json();

      // Track original staff IDs for deletion detection
      const ids = new Set<string>();
      data.forEach((s: StaffMember) => {
        if (s.id) ids.add(s.id);
      });
      setOriginalStaffIds(ids);

      setAcademicStaff(data.filter((s: StaffMember) => s.type === "ACADEMIC"));
      setAdjunctStaff(data.filter((s: StaffMember) => s.type === "ADJUNCT"));
      setNonAcademicStaff(
        data.filter((s: StaffMember) => s.type === "NON_ACADEMIC"),
      );
    } catch (error) {
      console.error("Failed to fetch staff:", error);
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (departmentId) {
      fetchStaff();
    }
  }, [departmentId, fetchStaff]);

  const createEmptyStaff = (
    type: "ACADEMIC" | "ADJUNCT" | "NON_ACADEMIC",
  ): StaffMember => ({
    title: "",
    gender: "",
    surname: "",
    middleName: "",
    firstName: "",
    highestQualification: "",
    academicRank: "",
    specialization: "",
    email: "",
    type,
    isNew: true,
  });

  const saveStaff = async () => {
    setIsSaving(true);
    try {
      const allStaff = [
        ...academicStaff.map((s) => ({ ...s, type: "ACADEMIC" })),
        ...adjunctStaff.map((s) => ({ ...s, type: "ADJUNCT" })),
        ...nonAcademicStaff.map((s) => ({ ...s, type: "NON_ACADEMIC" })),
      ];

      // Track current staff IDs to detect deletions
      const currentStaffIds = new Set<string>();

      for (const staff of allStaff) {
        // Skip empty rows (check required surname field)
        if (!staff.surname?.trim()) continue;

        // Track existing staff IDs
        if (staff.id && !staff.isNew) {
          currentStaffIds.add(staff.id);
        }

        if (staff.isNew || !staff.id) {
          // Create new staff
          await fetch("/api/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...staff,
              departmentId,
            }),
          });
        } else {
          // Update existing staff
          await fetch(`/api/staff/${staff.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(staff),
          });
        }
      }

      // Delete staff that were removed
      for (const originalId of originalStaffIds) {
        if (!currentStaffIds.has(originalId)) {
          await fetch(`/api/staff/${originalId}`, {
            method: "DELETE",
          });
        }
      }

      // Refresh data
      await fetchStaff();
    } catch (error) {
      console.error("Failed to save staff:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <CardTitle>Staff Directory</CardTitle>
        </div>
        {!disabled && (
          <Button onClick={saveStaff} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="academic" className="flex items-center gap-2">
              Academic Staff
              <Badge variant="secondary" className="ml-1">
                {academicStaff.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="adjunct" className="flex items-center gap-2">
              Adjunct Academic Staff
              <Badge variant="secondary" className="ml-1">
                {adjunctStaff.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="non-academic"
              className="flex items-center gap-2"
            >
              Non-Academic Staff
              <Badge variant="secondary" className="ml-1">
                {nonAcademicStaff.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="academic">
            <DynamicTable
              columns={academicColumns}
              data={academicStaff}
              onChange={setAcademicStaff}
              createEmptyRow={() => createEmptyStaff("ACADEMIC")}
              disabled={disabled}
            />
          </TabsContent>

          <TabsContent value="adjunct">
            <DynamicTable
              columns={academicColumns}
              data={adjunctStaff}
              onChange={setAdjunctStaff}
              createEmptyRow={() => createEmptyStaff("ADJUNCT")}
              disabled={disabled}
            />
          </TabsContent>

          <TabsContent value="non-academic">
            <DynamicTable
              columns={nonAcademicColumns}
              data={nonAcademicStaff}
              onChange={setNonAcademicStaff}
              createEmptyRow={() => createEmptyStaff("NON_ACADEMIC")}
              disabled={disabled}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default StaffTable;
