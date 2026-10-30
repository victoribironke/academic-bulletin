"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Loader2, Save, Users, Camera, Trash2, Info, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/imports/bulk-import-dialog";
import {
  STAFF_TEMPLATE_COLUMNS,
  STAFF_TEMPLATE_EXAMPLES,
  staffDuplicateKey,
  validateStaffImportRows,
  type StaffImportData,
} from "@/lib/imports/staff";
import { validateStaffEntryRows } from "@/lib/validation/staff-entry";

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
  readOnlyReason?: string;
}

type ImageVerificationFeedback = {
  status: "success" | "error";
  message: string;
};

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
    type: "text",
    placeholder: "e.g., Laboratory Technologist",
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
  readOnlyReason,
}: StaffTableProps) {
  const [academicStaff, setAcademicStaff] = useState<StaffMember[]>([]);
  const [adjunctStaff, setAdjunctStaff] = useState<StaffMember[]>([]);
  const [nonAcademicStaff, setNonAcademicStaff] = useState<StaffMember[]>([]);
  const [originalStaffIds, setOriginalStaffIds] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // True when the table has edits that haven't been saved yet.
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const markDirty = (dirty: boolean) => {
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
  };
  const [activeTab, setActiveTab] = useState("academic");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const fetchStaff = useCallback(async () => {
    try {
      // Keep the table on screen while refreshing; the full loader is only
      // for the very first load.
      setIsRefreshing(true);
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
        data
          .filter((s: StaffMember) => s.type === "NON_ACADEMIC")
          .map((s: StaffMember) => ({
            ...s,
            academicRank:
              s.customJobTitle || (s.academicRank === "OTHER" ? "" : s.academicRank),
          })),
      );
    } catch (error) {
      console.error("Failed to fetch staff:", error);
      toast.error("Failed to refresh the staff directory.");
    } finally {
      isDirtyRef.current = false;
      setIsDirty(false);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (!departmentId) return;
    const timeoutId = window.setTimeout(() => void fetchStaff(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [departmentId, fetchStaff]);

  // Pick up staff added elsewhere (e.g. the Staff Directory in another tab)
  // when the window regains focus - but never throw away unsaved edits.
  useEffect(() => {
    const refreshOnFocus = () => {
      if (!isDirtyRef.current) fetchStaff();
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [fetchStaff]);

  // Warn before closing or reloading the page with unsaved staff edits.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const handleManualRefresh = () => {
    if (
      isDirtyRef.current &&
      !window.confirm("Refreshing will discard your unsaved staff changes. Continue?")
    ) {
      return;
    }
    fetchStaff();
  };

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
    const errors: string[] = [];
    const createdMap = new Map<number, string>();
    const allStaff = [
      ...academicStaff.map((s) => ({ ...s, type: "ACADEMIC" as const })),
      ...adjunctStaff.map((s) => ({ ...s, type: "ADJUNCT" as const })),
      ...nonAcademicStaff.map((s) => ({
        ...s,
        type: "NON_ACADEMIC" as const,
        customJobTitle: s.academicRank,
        academicRank: "OTHER",
      })),
    ];
    const validationErrors = validateStaffEntryRows(allStaff);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0].message, {
        description:
          validationErrors.length > 1
            ? `${validationErrors.length - 1} more staff entry issue(s) need attention.`
            : undefined,
      });
      return;
    }

    setIsSaving(true);
    try {
      const currentStaffIds = new Set<string>();

      const responseError = async (res: Response, fallback: string) => {
        try {
          const body = (await res.json()) as { error?: string };
          return body.error || fallback;
        } catch {
          return fallback;
        }
      };

      for (let i = 0; i < allStaff.length; i++) {
        const staff = allStaff[i];
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
            errors.push(
              await responseError(
                res,
                `Failed to create ${staff.surname || "new staff"}.`,
              ),
            );
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
            errors.push(
              await responseError(res, `Failed to update ${staff.surname}.`),
            );
          }
        }
      }

      for (const originalId of originalStaffIds) {
        if (!currentStaffIds.has(originalId)) {
          const res = await fetch(`/api/staff/${originalId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            errors.push(
              await responseError(res, "Failed to delete a removed staff member."),
            );
            // Keep failed deletions in the tracked set so a later save retries
            // them instead of treating the record as successfully removed.
            currentStaffIds.add(originalId);
          }
        }
      }

      // Keep successful creations in sync even if another row failed. This
      // prevents a retry from creating duplicate staff records.
      const patchList = (list: StaffMember[], offset: number): StaffMember[] =>
        list.map((s, i) => {
          const createdId = createdMap.get(offset + i);
          return createdId ? { ...s, id: createdId, isNew: false } : s;
        });
      const acadLen = academicStaff.length;
      const adjLen = adjunctStaff.length;
      setAcademicStaff((prev) => patchList(prev, 0));
      setAdjunctStaff((prev) => patchList(prev, acadLen));
      setNonAcademicStaff((prev) => patchList(prev, acadLen + adjLen));
      setOriginalStaffIds(currentStaffIds);

      if (errors.length > 0) {
        markDirty(true);
        toast.error("Some staff entries were not saved.", {
          description: errors.join(" "),
        });
      } else {
        toast.success("All staff saved successfully");
        markDirty(false);
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
  const [imageVerificationFeedback, setImageVerificationFeedback] =
    useState<ImageVerificationFeedback | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openImageDialog = (staff: StaffMember | null) => {
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
        setImageVerificationFeedback({
          status: "success",
          message:
            data.message ||
            "Image passed verification and was uploaded successfully.",
        });
        toast.success("Image uploaded successfully");
      } else {
        const err = await res.json();
        setImageVerificationFeedback({
          status: "error",
          message:
            err.error ||
            "Image failed verification. Please upload a clearer professional passport-style photo.",
        });
        toast.error(err.error || "Failed to upload image");
      }
    } catch {
      setImageVerificationFeedback({
        status: "error",
        message:
          "Image upload failed due to a network or server issue. Please try again.",
      });
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

  const allStaffForPhotos = useMemo(() => 
    [...academicStaff, ...adjunctStaff, ...nonAcademicStaff].filter(
      (s) => s.id && s.surname?.trim(),
    ),
  [academicStaff, adjunctStaff, nonAcademicStaff]);

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
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <CardTitle>Staff Directory</CardTitle>
        </div>
        {!disabled && (
          <div className="flex flex-wrap items-center gap-2">
            {isDirty && (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Unsaved changes
              </span>
            )}
            <Button variant="outline" onClick={handleManualRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (allStaffForPhotos.length === 0) {
                  toast.error("Save staff members first before uploading photos");
                  return;
                }
                openImageDialog(null);
              }}
            >
              <Camera className="h-4 w-4 mr-2" />
              Manage Photos
            </Button>
            <Button onClick={saveStaff} disabled={isSaving || !isDirty}>
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
        {disabled && (
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              {readOnlyReason || "This staff directory is currently read-only."}
            </AlertDescription>
          </Alert>
        )}
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
              onChange={(rows) => {
                setAcademicStaff(rows);
                markDirty(true);
              }}
              createEmptyRow={() => createEmptyStaff("ACADEMIC")}
              disabled={disabled}
            />
          </TabsContent>

          <TabsContent value="adjunct">
            <DynamicTable
              columns={academicColumns}
              data={adjunctStaff}
              onChange={(rows) => {
                setAdjunctStaff(rows);
                markDirty(true);
              }}
              createEmptyRow={() => createEmptyStaff("ADJUNCT")}
              disabled={disabled}
            />
          </TabsContent>

          <TabsContent value="non-academic">
            <DynamicTable
              columns={nonAcademicColumns}
              data={nonAcademicStaff}
              onChange={(rows) => {
                setNonAcademicStaff(rows);
                markDirty(true);
              }}
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
          {imageVerificationFeedback && (
            <Alert
              variant={
                imageVerificationFeedback.status === "error"
                  ? "destructive"
                  : "default"
              }
            >
              <AlertDescription className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    Image verification{" "}
                    {imageVerificationFeedback.status === "success"
                      ? "passed"
                      : "failed"}
                  </p>
                  <p>{imageVerificationFeedback.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setImageVerificationFeedback(null)}
                >
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!imageStaff ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-2">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Photo guidelines:</strong> JPEG, PNG, or WebP. Max 4 MB.
                  Passport-style, at least 300×400 px, with a plain background.
                </AlertDescription>
              </Alert>
              {allStaffForPhotos.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => openImageDialog(staff)}
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
                  Upload a passport-style photo. JPEG, PNG, or WebP, max 4 MB, at least 300×400 px. Use a plain background and ensure the face is clearly visible.
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

      <BulkImportDialog<StaffImportData>
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        title="Bulk Upload Staff"
        description="Download the Excel template and enter staff only on its Upload sheet. All rows are validated before anything is saved. Staff photos remain individually managed."
        templateFilename="staff-bulk-upload-template.xlsx"
        templateColumns={STAFF_TEMPLATE_COLUMNS}
        templateRows={STAFF_TEMPLATE_EXAMPLES}
        previewColumns={[
          { label: "Name", value: (row) => `${row.surname}, ${row.firstName}` },
          { label: "Type", value: (row) => row.type },
          { label: "Rank / Role", value: (row) => row.customJobTitle || row.academicRank },
          { label: "Email", value: (row) => row.email || "-" },
        ]}
        validateRows={(rows) =>
          validateStaffImportRows(rows, [
            ...academicStaff,
            ...adjunctStaff,
            ...nonAcademicStaff,
          ].map(staffDuplicateKey))
        }
        onImport={async (rows) => {
          const response = await fetch("/api/staff/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ departmentId, rows }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Failed to import staff members.");
          toast.success(`${data.imported} staff member(s) imported successfully.`);
          await fetchStaff();
        }}
      />
    </Card>
  );
}

export default StaffTable;
