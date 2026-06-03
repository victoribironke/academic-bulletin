"use client";

import { useUser } from "@/contexts/user-context";
import { BulletinGenerator } from "@/components/forms/bulletin-generator";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function BulletinsPage() {
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

  // Allow access for Admin, Super Admin, and Dean
  const canAccess =
    currentUser?.role === "ADMIN" ||
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "DEAN";

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-destructive">
            Access Denied
          </h2>
          <p className="text-muted-foreground">
            You do not have permission to generate bulletins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">
          Academic Bulletins
        </h1>
        <p className="text-muted-foreground">
          Generate official academic bulletins for schools or the entire
          institution.
        </p>
      </div>

      <BulletinGenerator />
    </div>
  );
}
