"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { usePermission, useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/states";
import { SubmissionsList } from "@/components/submissions/submissions-list";

/** HODs: read-only view of every programme's submission, own programme first. */
export default function SubmissionsBrowsePage() {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const { currentUser, isLoading: userLoading } = useUser();
  const canView = hasPermission("view:submissions");
  const isHod = currentUser?.role === "HOD";

  useEffect(() => {
    if (userLoading) return;
    if (!currentUser) router.replace("/");
    else if (!canView) router.replace("/dashboard");
    else if (!isHod) router.replace("/submissions");
  }, [userLoading, currentUser, canView, isHod, router]);

  return (
    <div>
      <PageHeader
        title="All programme submissions"
        description="Other departments' submissions are read-only. Your own programme is listed first."
        actions={
          <Button asChild variant="outline">
            <Link href="/submissions/me">
              <ArrowLeft />
              Back to my submission
            </Link>
          </Button>
        }
      />

      {userLoading || !currentUser || !isHod ? (
        <TableSkeleton columns={6} />
      ) : (
        <SubmissionsList highlightDepartmentId={currentUser.departmentId} />
      )}
    </div>
  );
}
