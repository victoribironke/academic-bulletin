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
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  let schoolId = formData.get("schoolId") as string | null;
  let departmentId = formData.get("departmentId") as string | null;

  if (schoolId === "none") schoolId = null;
  if (departmentId === "none") departmentId = null;

  if (!firstName || !lastName || !email || !password || !role) {
    return {
      error: "First Name, Last Name, Email, Password, and Role are required.",
    };
  }

  // Only SUPER_ADMINs can create other SUPER_ADMINs
  if (role === "SUPER_ADMIN" && requestingUser.role !== "SUPER_ADMIN") {
    return {
      error: "Only Super Administrators can create other Super Administrators.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
    // 4. Create User in Supabase directly
    const { data: authData, error: createError } =
      await adminAuthClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm
        user_metadata: {
          firstName,
          lastName,
        },
      });

    if (createError) {
      console.error("Supabase Admin Create Error:", createError);
      return { error: createError.message };
    }

    if (!authData.user) {
      return { error: "Failed to create user in authentication provider." };
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
