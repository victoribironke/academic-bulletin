"use client";

import { logIn } from "@/app/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

const initialState = { error: "" };

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(logIn, initialState);

  return (
    <div className="flex bg-background min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-xl border shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Sign In
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter your email and password to access your account
          </p>
        </div>

        <form action={formAction} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium leading-none"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="you@university.edu"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium leading-none"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {state?.error && (
            <div className="text-sm font-medium text-destructive">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
          >
            {isPending ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Signup removed temporarily */}
      </div>
    </div>
  );
}
