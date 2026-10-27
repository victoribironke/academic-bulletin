"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const adminAuthClient = createAdminClient();
    // Send login instructions through the configured Supabase email provider.
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.NODE_ENV === "production" && !process.env.IS_DOCKER
        ? "http://bulletin.babcock.edu.ng"
        : "http://localhost:3300");

    let userId: string;
    let inviteLink: string | null = null;

    const { data: inviteData, error: inviteError } =
      await adminAuthClient.auth.admin.inviteUserByEmail(email, {
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
        redirectTo: `${siteUrl}/confirm`,
      });

    if (inviteError || !inviteData?.user) {
      // Fallback: If SMTP is not configured or delivery fails, generate invite link directly
      const { data: linkData, error: linkError } =
        await adminAuthClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            data: { first_name: firstName.trim(), last_name: lastName.trim() },
            redirectTo: `${siteUrl}/confirm`,
          },
        });

      if (linkError || !linkData?.user) {
        console.error("Supabase user invitation failed:", inviteError || linkError);
        return {
          error:
            inviteError?.message ||
            linkError?.message ||
            "The invitation service did not create a user.",
        };
      }

      userId = linkData.user.id;
      inviteLink = linkData.properties?.action_link || null;
    } else {
      userId = inviteData.user.id;
    }

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

    revalidatePath("/users");
    const result: { success: true; email: string; inviteLink?: string } = {
      success: true,
      email,
    };
    if (inviteLink) {
      result.inviteLink = inviteLink;
    }
    return result;
  } catch (error) {
    console.error("Admin user creation failed:", error);
    return { error: "An unexpected error occurred during user creation." };
  }
}
