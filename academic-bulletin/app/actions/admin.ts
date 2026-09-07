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
    console.error("adminCreateUser: auth.getUser() failed:", {
      authError: authError?.message || authError,
      hasUser: !!currentUser,
    });
    return {
      error:
        authError?.message ||
        "Authentication required. Please refresh the page and sign in again.",
    };
  }

  const requestingUser = await prisma.user.findUnique({
    where: { id: currentUser.id },
  });

  if (
    !requestingUser ||
    (requestingUser.role !== "ADMIN" && requestingUser.role !== "SUPER_ADMIN")
  ) {
    console.error("adminCreateUser: Unauthorized user attempted creation:", {
      id: currentUser.id,
      role: requestingUser?.role,
    });
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

  const port = process.env.PORT || "3000";
  const supabaseUrl =
    process.env.INTERNAL_SUPABASE_URL ||
    `http://127.0.0.1:${port}`;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase Service Role configuration:", {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey,
    });
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
    // 4. Generate invite link via Supabase admin API.
    //    We use generateLink instead of inviteUserByEmail so that the invite URL
    //    is returned directly — no SMTP required. The admin copies and shares it.
    const siteUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/auth\/v1\/?$/, "") ||
      (process.env.NODE_ENV === "production"
        ? "http://bulletin.babcock.edu.ng"
        : "http://localhost:3300");

    const { data: linkData, error: linkError } =
      await adminAuthClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: { firstName, lastName },
          redirectTo: `${siteUrl}/invite-accept`,
        },
      });

    if (linkError) {
      console.error("Supabase generateLink Error:", linkError);
      return { error: linkError.message };
    }

    if (!linkData.user || !linkData.properties?.action_link) {
      return { error: "Failed to generate invite link." };
    }

    // 5. Create Profile in Prisma
    await prisma.user.create({
      data: {
        id: linkData.user.id,
        email: email,
        firstName,
        lastName,
        role: role as any,
        schoolId: schoolId || null,
        departmentId: departmentId || null,
      },
    });

    revalidatePath("/users");
    return { success: true, inviteLink: linkData.properties.action_link };
  } catch (error) {
    console.error("Admin user creation failed:", error);
    return { error: "An unexpected error occurred during user creation." };
  }
}
