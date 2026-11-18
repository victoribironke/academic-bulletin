"use server";

import { signIn, signOut } from "@/auth";

/** Starts Google sign-in; Google returns the user to /dashboard. */
export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function logOut() {
  await signOut({ redirectTo: "/login" });
}
