"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import prisma from "@/lib/prisma";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function adminCreateUser(prevState: any, formData: FormData) {
  // 1. Verify Requesting User's Permissions
  const serverSupabase = await createServerClient();
  const {
    data: { user: currentUser },
    error: authError,
  } = await serverSupabase.auth.getUser();

  if (authError || !currentUser) {
    return { error: "Authentication required" };
  }

  const requestingUser = await prisma.user.findUnique({
    where: { id: currentUser.id },
  });

  if (
    !requestingUser ||
    (requestingUser.role !== "ADMIN" && requestingUser.role !== "SUPER_ADMIN")
  ) {
    return { error: "Unauthorized: Only Admins can create new users." };
  }

  // 2. Validate Form Data
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string;
  let schoolId = formData.get("schoolId") as string | null;
  let departmentId = formData.get("departmentId") as string | null;

  if (schoolId === "none") schoolId = null;
  if (departmentId === "none") departmentId = null;

  if (!firstName || !lastName || !email || !role) {
    return {
      error: "First Name, Last Name, Email, and Role are required.",
    };
  }

  // Only SUPER_ADMINs can create other SUPER_ADMINs
  if (role === "SUPER_ADMIN" && requestingUser.role !== "SUPER_ADMIN") {
    return {
      error: "Only Super Administrators can create other Super Administrators.",
    };
  }

  const supabaseUrl = process.env.INTERNAL_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase Service Role configuration.");
    return { error: "Server configuration error. Contact administrator." };
  }

  // 3. Instantiate Supabase Admin Client
  const adminAuthClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // 4. Invite User via Supabase (sends invite email automatically)
    const siteUrl = process.env.NODE_ENV === "production"
      ? "https://academic-bulletin.vercel.app"
      : "http://localhost:3000";
    const { data: authData, error: inviteError } =
      await adminAuthClient.auth.admin.inviteUserByEmail(email, {
        data: {
          firstName,
          lastName,
        },
        redirectTo: `${siteUrl}/confirm`,
      });

    if (inviteError) {
      console.error("Supabase Invite Error:", inviteError);
      return { error: inviteError.message };
    }

    if (!authData.user) {
      return { error: "Failed to invite user." };
    }

    // 5. Create Profile in Prisma
    await prisma.user.create({
      data: {
        id: authData.user.id,
        email: email,
        firstName,
        lastName,
        role: role as any,
        schoolId: schoolId || null,
        departmentId: departmentId || null,
      },
    });

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Admin user creation failed:", error);
    return { error: "An unexpected error occurred during user creation." };
  }
}
