"use client";

import { useUser } from "@/contexts/user-context";
import { MasterCourseManager } from "@/components/forms/MasterCourseManager";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MasterCoursesPage() {
  const { currentUser, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !currentUser) {
      router.push("/");
    }
  }, [currentUser, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Allow access for Admin, Super Admin, Dean, and HOD
  const canAccess =
    currentUser?.role === "ADMIN" ||
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "DEAN" ||
    currentUser?.role === "HOD";

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-destructive">
            Access Denied
          </h2>
          <p className="text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Master Courses</h1>
        <p className="text-muted-foreground">
          Manage the central registry of courses.
        </p>
      </div>

      <MasterCourseManager
        departmentId={currentUser?.departmentId || undefined}
      />
    </div>
  );
}
