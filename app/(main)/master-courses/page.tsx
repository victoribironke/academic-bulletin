"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { MasterCourseManager } from "@/components/forms/MasterCourseManager";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, TableSkeleton } from "@/components/shared/states";

export default function MasterCoursesPage() {
  const { currentUser, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !currentUser) router.push("/");
  }, [currentUser, isLoading, router]);

  if (isLoading) return <TableSkeleton columns={5} />;

  const canAccess =
    currentUser?.role === "ADMIN" ||
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "DEAN" ||
    currentUser?.role === "HOD";

  if (!canAccess) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        className="mt-8"
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Master Courses"
        description="The central course registry. University-wide GST courses are automatically preloaded into programme submissions, and their hosting departments can maintain the shared learning details."
      />
      <MasterCourseManager departmentId={currentUser?.departmentId || undefined} />
    </div>
  );
}
