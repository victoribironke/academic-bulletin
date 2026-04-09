"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Building2 } from "lucide-react";

function InviteContent() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type") || "invite"; // default to invite

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

      // Verification successful. User has an active session now.
      // Redirect them to set their permanent password.
      router.push("/confirm");
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred verifying your invitation.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex bg-background min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-xl border shadow-sm text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {typeParam === "recovery" ? "Password Recovery" : "System Invitation"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {typeParam === "recovery" 
              ? "Click below to verify your password reset request securely."
              : "You have been invited to join the Academic Bulletin Management System."}
          </p>
        </div>

        {error && (
          <div className="p-3 text-sm font-medium text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={isLoading || !tokenHash}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
        >
          {isLoading ? "Verifying..." : typeParam === "recovery" ? "Verify Request & Continue" : "Accept Invitation & Continue"}
        </button>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
