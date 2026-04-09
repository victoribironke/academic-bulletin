"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setError("");

    try {
      // The redirectTo shouldn't point directly to confirm in this setup,
      // it should point to our interstitial invite-accept screen with type=recovery
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/invite-accept?type=recovery`,
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setIsSuccess(true);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex bg-background min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-xl border shadow-sm relative">
        <Link 
          href="/login" 
          className="absolute top-8 left-8 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to login"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        
        <div className="space-y-2 text-center pt-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Forgot Password?
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        {isSuccess ? (
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-md text-center space-y-3">
            <p className="font-medium text-primary">Check your email</p>
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a password reset link to <span className="font-medium">{email}</span>.
            </p>
            <p className="text-xs text-muted-foreground pt-2">
              (You can safely close this page)
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium leading-none"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="you@university.edu"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || !email}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
            >
              {isPending ? "Sending link..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
