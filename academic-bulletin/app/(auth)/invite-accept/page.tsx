"use client";

import { useState, useEffect, Suspense } from "react";
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

  useEffect(() => {
    // 1. If an active session already exists (e.g. from GoTrue /verify redirect), forward to password setup
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        router.replace("/confirm");
      }
    };
    checkSession();

    // 2. Listen for auth state changes if client is parsing hash fragments (#access_token=...)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        router.replace("/confirm");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth, router]);

  const handleAccept = async () => {
    // If already authenticated, proceed directly to confirm
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      router.push("/confirm");
      return;
    }

    if (!tokenHash) {
      setError("No valid token found in the URL. If you received an invitation email, please click the button in the email.");
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
        disabled={isLoading}
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
