"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandedShell } from "@/components/auth/branded-shell";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized:
    "This Google account doesn't have access. Ask an administrator to add your email address, then try again.",
  account_deactivated:
    "This account has been deactivated. Contact an administrator for assistance.",
  sign_in_failed: "Sign-in didn't complete. Please try again.",
};

function LoginError({ localError }: { localError: string }) {
  const searchParams = useSearchParams();
  const code = searchParams.get("error");
  const message =
    localError || (code ? (ERROR_MESSAGES[code] ?? ERROR_MESSAGES.sign_in_failed) : "");
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mt-6 rounded-md bg-destructive/10 p-3 text-center text-sm font-medium text-destructive"
    >
      {message}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [isPending, setIsPending] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleGoogleSignIn = async () => {
    setIsPending(true);
    setLocalError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Always show the account picker so staff can choose which account to use.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setLocalError(ERROR_MESSAGES.sign_in_failed);
      setIsPending(false);
    }
    // On success the browser is redirected to Google.
  };

  return (
    <BrandedShell>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Sign in
        </h1>
        <p className="text-sm text-muted-foreground">
          Academic Bulletin Review System
        </p>
      </div>

      <Suspense fallback={null}>
        <LoginError localError={localError} />
      </Suspense>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isPending}
        className="mt-8 inline-flex h-11 w-full items-center justify-center gap-3 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        <GoogleIcon />
        {isPending ? "Redirecting to Google..." : "Sign in with Google"}
      </button>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Use the Google account whose email address an administrator added for
        you.
      </p>
    </BrandedShell>
  );
}
