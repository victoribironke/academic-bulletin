"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { DynamicTable, Column } from "./dynamic-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, Users, Camera, Trash2, Info } from "lucide-react";
import { toast } from "sonner";

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
  imageUrl?: string;
  imageDriveFileId?: string;
  type: "ACADEMIC" | "ADJUNCT" | "NON_ACADEMIC";
  customJobTitle?: string;
  isNew?: boolean;
  fullName?: string;
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
    key: "customJobTitle",
    header: "Custom Title (if Other)",
    type: "text",
    placeholder: "e.g., Office Assistant",
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
    const errors: string[] = [];
    const createdMap = new Map<number, string>();
    try {
      const allStaff = [
        ...academicStaff.map((s) => ({ ...s, type: "ACADEMIC" })),
        ...adjunctStaff.map((s) => ({ ...s, type: "ADJUNCT" })),
        ...nonAcademicStaff.map((s) => ({ ...s, type: "NON_ACADEMIC" })),
      ];

      const currentStaffIds = new Set<string>();

      for (let i = 0; i < allStaff.length; i++) {
        const staff = allStaff[i];
        if (!staff.surname?.trim()) continue;

        if (staff.id && !staff.isNew) {
          currentStaffIds.add(staff.id);
        }

        if (staff.isNew || !staff.id) {
          const res = await fetch("/api/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...staff, departmentId }),
          });
          if (!res.ok) {
            errors.push(`Failed to create ${staff.surname || "new staff"}`);
          } else {
            const created = await res.json();
            createdMap.set(i, created.id);
            currentStaffIds.add(created.id);
          }
        } else {
          const res = await fetch(`/api/staff/${staff.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(staff),
          });
          if (!res.ok) {
            errors.push(`Failed to update ${staff.surname}`);
          }
        }
      }

      for (const originalId of originalStaffIds) {
        if (!currentStaffIds.has(originalId)) {
          const res = await fetch(`/api/staff/${originalId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            errors.push("Failed to delete a removed staff member");
          }
        }
      }

      if (errors.length > 0) {
        toast.error(`Some staff failed to save: ${errors.join("; ")}`);
      } else {
        toast.success("All staff saved successfully");

        // Patch local state: assign server IDs to created entries, clear isNew
        const patchList = (list: StaffMember[], offset: number): StaffMember[] =>
          list.map((s, i) => {
            const createdId = createdMap.get(offset + i);
            if (createdId) return { ...s, id: createdId, isNew: false };
            return s.isNew ? { ...s, isNew: false } : s;
          });

        const acadLen = academicStaff.length;
        const adjLen = adjunctStaff.length;
        setAcademicStaff((prev) => patchList(prev, 0));
        setAdjunctStaff((prev) => patchList(prev, acadLen));
        setNonAcademicStaff((prev) => patchList(prev, acadLen + adjLen));
        setOriginalStaffIds(currentStaffIds);
      }
    } catch (error) {
      console.error("Failed to save staff:", error);
      toast.error("Failed to save staff. Your changes are still in the editor.");
    } finally {
      setIsSaving(false);
    }
  };

  // Image upload state
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageStaff, setImageStaff] = useState<StaffMember | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openImageDialog = (staff: StaffMember) => {
    setImageStaff(staff);
    setImageDialogOpen(true);
  };

  const handleImageUpload = async (file: File) => {
    if (!imageStaff?.id) {
      toast.error("Please save the staff member before uploading an image");
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`/api/staff/${imageStaff.id}/image`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const updateStaffList = (list: StaffMember[]) =>
          list.map((s) =>
            s.id === imageStaff.id ? { ...s, imageUrl: data.imageUrl, imageDriveFileId: data.fileId } : s,
          );
        setAcademicStaff(updateStaffList);
        setAdjunctStaff(updateStaffList);
        setNonAcademicStaff(updateStaffList);
        setImageStaff((prev) => prev ? { ...prev, imageUrl: data.imageUrl } : prev);
        toast.success("Image uploaded successfully");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to upload image");
      }
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageRemove = async () => {
    if (!imageStaff?.id) return;

    try {
      const res = await fetch(`/api/staff/${imageStaff.id}/image`, { method: "DELETE" });
      if (res.ok) {
        const updateStaffList = (list: StaffMember[]) =>
          list.map((s) =>
            s.id === imageStaff.id ? { ...s, imageUrl: undefined, imageDriveFileId: undefined } : s,
          );
        setAcademicStaff(updateStaffList);
        setAdjunctStaff(updateStaffList);
        setNonAcademicStaff(updateStaffList);
        setImageStaff((prev) => prev ? { ...prev, imageUrl: undefined } : prev);
        toast.success("Image removed");
      }
    } catch {
      toast.error("Failed to remove image");
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

  const allStaffForPhotos = [...academicStaff, ...adjunctStaff, ...nonAcademicStaff].filter(
    (s) => s.id && s.surname?.trim(),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <CardTitle>Staff Directory</CardTitle>
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (allStaffForPhotos.length === 0) {
                  toast.error("Save staff members first before uploading photos");
                  return;
                }
                setImageDialogOpen(true);
                setImageStaff(null);
              }}
            >
              <Camera className="h-4 w-4 mr-2" />
              Manage Photos
            </Button>
            <Button onClick={saveStaff} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save All
            </Button>
          </div>
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

      {/* Staff Photos Dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {imageStaff
                ? `Photo: ${imageStaff.surname}, ${imageStaff.firstName}`
                : "Staff Photos"}
            </DialogTitle>
          </DialogHeader>

          {!imageStaff ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-2">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Photo guidelines:</strong> JPEG, PNG, or WebP. Max 5 MB.
                  Passport-style, at least 300×400 px, with a plain background.
                </AlertDescription>
              </Alert>
              {allStaffForPhotos.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => setImageStaff(staff)}
                >
                  <div className="flex items-center gap-3">
                    {staff.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={staff.imageUrl}
                        alt={staff.surname}
                        className="h-10 w-10 rounded-full object-cover border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        No
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {staff.surname}, {staff.firstName}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {staff.type.toLowerCase().replace("_", "-")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={staff.imageUrl ? "default" : "outline"} className="text-xs">
                    {staff.imageUrl ? "Has photo" : "No photo"}
                  </Badge>
                </div>
              ))}
              {allStaffForPhotos.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No saved staff members found. Save staff first.
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Upload a passport-style photo. JPEG, PNG, or WebP, max 5 MB, at least 300×400 px. Use a plain background and ensure the face is clearly visible.
                </AlertDescription>
              </Alert>

              <div className="flex justify-center">
                {imageStaff.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageStaff.imageUrl}
                    alt={`${imageStaff.surname} photo`}
                    className="h-48 w-36 rounded-lg object-cover border"
                  />
                ) : (
                  <div className="h-48 w-36 rounded-lg bg-muted border-2 border-dashed flex items-center justify-center">
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />

              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage || !imageStaff.id}
                >
                  {isUploadingImage ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  {imageStaff.imageUrl ? "Replace Photo" : "Upload Photo"}
                </Button>
                {imageStaff.imageUrl && (
                  <Button variant="destructive" size="sm" onClick={handleImageRemove}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>

              {!imageStaff.id && (
                <p className="text-center text-xs text-amber-600">
                  Save this staff member first before uploading a photo.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="shrink-0 border-t pt-4">
            {imageStaff ? (
              <Button variant="outline" onClick={() => setImageStaff(null)}>
                Back to List
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setImageDialogOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default StaffTable;
