"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
import { usePermission, useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/states";
import { SubmissionsList } from "@/components/submissions/submissions-list";

export default function SubmissionsPage() {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const { currentUser, isLoading: userLoading } = useUser();
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [initializing, setInitializing] = useState(false);

  const isHod = currentUser?.role === "HOD";
  const isAdmin =
    currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

  // HODs work on a single submission; send them to it.
  useEffect(() => {
    if (!userLoading && isHod) router.replace("/submissions/me");
  }, [userLoading, isHod, router]);

  const handleInitialize = async () => {
    if (!cycleId) return;
    const ok = window.confirm(
      "This creates a draft submission for every programme that doesn't have one in this cycle yet. Continue?",
    );
    if (!ok) return;

    setInitializing(true);
    try {
      const res = await fetch("/api/submissions/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Created ${data.createdCount} new draft submission${data.createdCount === 1 ? "" : "s"}.`,
        );
        setReloadKey((k) => k + 1);
      } else {
        toast.error("Couldn't create submissions", { description: data.error });
      }
    } catch {
      toast.error("Couldn't create submissions. Please try again.");
    } finally {
      setInitializing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Submissions"
        description="Bulletin submissions from every programme. Open one to review it."
        actions={
          <>
            {isAdmin && cycleId && (
              <Button variant="outline" onClick={handleInitialize} disabled={initializing}>
                <Sparkles />
                {initializing ? "Creating..." : "Create missing drafts"}
              </Button>
            )}
            {hasPermission("create:submission") && (
              <Button asChild>
                <Link href="/submissions/new">
                  <Plus />
                  New submission
                </Link>
              </Button>
            )}
          </>
        }
      />

      {userLoading || !currentUser || isHod ? (
        <TableSkeleton columns={6} />
      ) : (
        <SubmissionsList
          schoolId={currentUser.role === "DEAN" ? currentUser.schoolId : null}
          reloadKey={reloadKey}
          onCycleChange={setCycleId}
          emptyDescription={
            isAdmin
              ? "Use “Create missing drafts” to start a submission for every programme in this cycle."
              : "Submissions for your programmes will appear here."
          }
        />
      )}
    </div>
  );
}
