"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { BulletinGenerator } from "@/components/forms/bulletin-generator";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton, EmptyState } from "@/components/shared/states";

export default function BulletinsPage() {
  const { currentUser, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !currentUser) router.push("/");
  }, [currentUser, isLoading, router]);

  if (isLoading) return <CardGridSkeleton count={3} />;

  const canAccess =
    currentUser?.role === "ADMIN" ||
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "DEAN";

  if (!canAccess) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="Only deans and administrators can generate bulletins."
        className="mt-8"
      />
    );
  }

  return (
    <div>
      <PageHeader
        className="print:hidden"
        title="Bulletins"
        description="Generate the official academic bulletin for a school or the whole institution, as Word or PDF."
      />
      <BulletinGenerator />
    </div>
  );
}
