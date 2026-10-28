"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/contexts/user-context";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";

export default function SubmissionsMePage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const [fetchError, setFetchError] = useState<string | null>(null);

  const noDepartmentMessage =
    !userLoading &&
    currentUser?.role === "HOD" &&
    !currentUser.departmentId
      ? "Your account is not linked to a department."
      : null;

  const message = noDepartmentMessage || fetchError;

  useEffect(() => {
    if (userLoading) return;
    if (!currentUser) {
      router.replace("/");
      return;
    }
    if (currentUser.role !== "HOD") {
      router.replace("/submissions");
      return;
    }
    if (!currentUser.departmentId) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const cyclesRes = await fetch("/api/cycles");
        if (cancelled) return;
        setFetchError(null);

        let activeCycleId: string | null = null;
        if (cyclesRes.ok) {
          const cycles = await cyclesRes.json();
          activeCycleId =
            cycles.find((c: { isActive: boolean }) => c.isActive)?.id ?? null;
        }

        const tryFetch = async (cycleId: string | null) => {
          const params = new URLSearchParams({
            departmentId: currentUser.departmentId!,
          });
          if (cycleId) params.set("cycleId", cycleId);
          const res = await fetch(`/api/submissions?${params}`);
          if (!res.ok) return [];
          return (await res.json()) as { id: string; updatedAt: string }[];
        };

        let list = activeCycleId ? await tryFetch(activeCycleId) : [];
        if (list.length === 0) {
          list = await tryFetch(null);
        }

        if (cancelled) return;
        if (list.length === 0) {
          setFetchError(
            "No submission found for your department in this cycle.",
          );
          return;
        }

        router.replace(`/submissions/${list[0].id}`);
      } catch {
        if (!cancelled) setFetchError("Could not load your submission.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, userLoading, router]);

  if (message) {
    return (
      <EmptyState
        icon={FileText}
        title="Your submission isn't available"
        description={message}
        action={
          <Button asChild variant="outline">
            <Link href="/submissions/browse">Browse all programme submissions</Link>
          </Button>
        }
        className="mt-8"
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin mb-2" />
      <p>Opening your programme submission…</p>
    </div>
  );
}
