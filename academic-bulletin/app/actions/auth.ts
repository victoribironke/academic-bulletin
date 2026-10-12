"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export async function logIn(prevState: any, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const appUser = data.user
    ? await prisma.user.findFirst({
        where: { OR: [{ id: data.user.id }, { email: data.user.email! }] },
        select: { isActive: true },
      })
    : null;

  if (!appUser?.isActive) {
    await supabase.auth.signOut({ scope: "global" });
    return {
      error:
        "This account has been deactivated. Contact an administrator for assistance.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// User registration has been disabled and users will be managed manually

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
