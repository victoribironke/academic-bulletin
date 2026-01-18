"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DynamicTable, Column } from "./dynamic-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Users } from "lucide-react";

interface StaffMember {
  id?: string;
  name: string;
  position: string;
  specialization: string;
  email: string;
  type: "ACADEMIC" | "ADJUNCT" | "NON_ACADEMIC";
  isNew?: boolean;
}

interface StaffTableProps {
  departmentId: string;
  disabled?: boolean;
}

const positionOptions = [
  { value: "Professor", label: "Professor" },
  { value: "Associate Professor", label: "Associate Professor" },
  { value: "Senior Lecturer", label: "Senior Lecturer" },
  { value: "Lecturer I", label: "Lecturer I" },
  { value: "Lecturer II", label: "Lecturer II" },
  { value: "Assistant Lecturer", label: "Assistant Lecturer" },
  { value: "Graduate Assistant", label: "Graduate Assistant" },
  {
    value: "Principal Laboratory Technologist",
    label: "Principal Lab Technologist",
  },
  { value: "Laboratory Technologist", label: "Lab Technologist" },
  { value: "Principal Office Manager", label: "Principal Office Manager" },
  { value: "Administrative Assistant", label: "Administrative Assistant" },
];

const academicColumns: Column<StaffMember>[] = [
  {
    key: "name",
    header: "Name",
    type: "text",
    placeholder: "e.g., Prof. John Doe",
    required: true,
  },
  {
    key: "position",
    header: "Position",
    type: "select",
    options: positionOptions,
    required: true,
  },
  {
    key: "specialization",
    header: "Area of Specialization",
    type: "text",
    placeholder: "e.g., Artificial Intelligence",
  },
  {
    key: "email",
    header: "Email",
    type: "text",
    placeholder: "e.g., john.doe@babcock.edu.ng",
  },
];

const nonAcademicColumns: Column<StaffMember>[] = [
  {
    key: "name",
    header: "Name",
    type: "text",
    placeholder: "e.g., Mr. James Smith",
    required: true,
  },
  {
    key: "position",
    header: "Position",
    type: "select",
    options: positionOptions,
    required: true,
  },
  {
    key: "email",
    header: "Email",
    type: "text",
    placeholder: "e.g., james.smith@babcock.edu.ng",
  },
];

export function StaffTable({
  departmentId,
  disabled = false,
}: StaffTableProps) {
  const [academicStaff, setAcademicStaff] = useState<StaffMember[]>([]);
  const [adjunctStaff, setAdjunctStaff] = useState<StaffMember[]>([]);
  const [nonAcademicStaff, setNonAcademicStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("academic");

  const fetchStaff = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/staff?departmentId=${departmentId}`);
      if (!res.ok) throw new Error("Failed to fetch staff");

      const data = await res.json();

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
    name: "",
    position: "",
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

      for (const staff of allStaff) {
        if (!staff.name.trim()) continue; // Skip empty rows

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
              Adjunct Staff
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
