"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandedShell } from "@/components/auth/branded-shell";

function InviteContent() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type") || "invite";

  const handleAccept = async () => {
    if (!tokenHash) {
      setError("No valid token found in the URL.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: typeParam as "invite" | "recovery",
      });

      if (verifyError) {
        setError(verifyError.message);
        setIsLoading(false);
        return;
      }

      router.push("/confirm");
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred verifying your invitation.");
      setIsLoading(false);
    }
  };

  return (
    <BrandedShell>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          {typeParam === "recovery"
            ? "Verify reset request"
            : "Accept your invitation"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {typeParam === "recovery"
            ? "Confirm this request to choose a new password."
            : "Complete setup for your Academic Bulletin account."}
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-md bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={isLoading || !tokenHash}
        className="mt-8 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {isLoading
          ? "Verifying..."
          : typeParam === "recovery"
            ? "Continue"
            : "Continue"}
      </button>
    </BrandedShell>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
