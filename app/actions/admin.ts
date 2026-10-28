"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAccessGrantedEmail } from "@/lib/email/notifications";

const USER_ROLES = ["HOD", "DEAN", "ADMIN", "SUPER_ADMIN"] as const;

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
    !requestingUser.isActive ||
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
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const rawRole = formData.get("role") as string;
  let schoolId = formData.get("schoolId") as string | null;
  let departmentId = formData.get("departmentId") as string | null;

  if (schoolId === "none") schoolId = null;
  if (departmentId === "none") departmentId = null;

  if (!firstName?.trim() || !lastName?.trim() || !email || !rawRole) {
    return {
      error: "First Name, Last Name, Email, and Role are required.",
    };
  }

  if (!USER_ROLES.includes(rawRole as (typeof USER_ROLES)[number])) {
    return { error: "Invalid system role." };
  }
  const role = rawRole as (typeof USER_ROLES)[number];

  // Only SUPER_ADMINs can create other SUPER_ADMINs
  if (role === "SUPER_ADMIN" && requestingUser.role !== "SUPER_ADMIN") {
    return {
      error: "Only Super Administrators can create other Super Administrators.",
    };
  }


  if (role === "HOD" && !departmentId) {
    return { error: "A Head of Department must be assigned to a department." };
  }
  if (role === "DEAN" && !schoolId) {
    return { error: "A Dean must be assigned to a school." };
  }
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    schoolId = null;
    departmentId = null;
  } else if (role === "DEAN") {
    departmentId = null;
  }

  if (departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { schoolId: true },
    });
    if (!department || department.schoolId !== schoolId) {
      return {
        error: "The selected department does not belong to the selected school.",
      };
    }
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return { error: "A user with this email address already exists." };
    }

    // Create the sign-in account up front. No password and no invite: when
    // this person signs in with a Google account using the same email,
    // Supabase links it to this account automatically.
    const adminAuthClient = createAdminClient();
    const { data: created, error: createError } =
      await adminAuthClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name: firstName.trim(), last_name: lastName.trim() },
      });

    if (createError || !created?.user) {
      console.error("Supabase user creation failed:", createError);
      return {
        error: createError?.message || "The sign-in account could not be created.",
      };
    }
    const userId = created.user.id;

    try {
      await prisma.user.create({
        data: {
          id: userId,
          email,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
          schoolId: schoolId || null,
          departmentId: departmentId || null,
        },
      });
    } catch (profileError) {
      await adminAuthClient.auth.admin.deleteUser(userId);
      throw profileError;
    }

    const emailSent = await sendAccessGrantedEmail({
      to: email,
      firstName: firstName.trim(),
      role,
    });

    revalidatePath("/users");
    return { success: true as const, email, emailSent };
  } catch (error) {
    console.error("Admin user creation failed:", error);
    return { error: "An unexpected error occurred during user creation." };
  }
}
