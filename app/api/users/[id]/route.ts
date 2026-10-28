import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/users/[id] - Get a single user
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        schoolId: true,
        departmentId: true,
        school: {
          select: { id: true, name: true, code: true },
        },
        department: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

// Role tier hierarchy: higher number = higher privilege
const ROLE_TIERS: Record<string, number> = {
  HOD: 1,
  DEAN: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

function getRoleTier(role: string): number {
  return ROLE_TIERS[role] ?? 0;
}

// PATCH /api/users/[id] - Update a user (name, role, unit, active status)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { role, isActive, schoolId, departmentId } = body;

    // Names: trimmed only, so spellings like "McDonald" or "O'Neil" are kept.
    const names: { firstName?: string; lastName?: string } = {};
    for (const field of ["firstName", "lastName"] as const) {
      if (body[field] === undefined) continue;
      const value = typeof body[field] === "string" ? body[field].trim() : "";
      if (!value || value.length > 80) {
        return NextResponse.json(
          { error: `${field === "firstName" ? "First" : "Last"} name is required (up to 80 characters).` },
          { status: 400 },
        );
      }
      names[field] = value;
    }
    const onlyNames =
      role === undefined &&
      isActive === undefined &&
      schoolId === undefined &&
      departmentId === undefined;

    if (role !== undefined && !(role in ROLE_TIERS)) {
      return NextResponse.json(
        { error: "Invalid system role." },
        { status: 400 },
      );
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean." },
        { status: 400 },
      );
    }

    // 1. Get the requesting user from the Supabase session
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const requestingUser = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    // Anyone may correct their own name; everything else needs an admin.
    const isOwnNameChange = requestingUser?.id === id && onlyNames;

    if (
      !requestingUser ||
      !requestingUser.isActive ||
      (!isOwnNameChange && getRoleTier(requestingUser.role) < getRoleTier("ADMIN"))
    ) {
      return NextResponse.json(
        { error: "Unauthorized: Only Admins can modify users." },
        { status: 403 }
      );
    }

    // 2. Get the target user to check their current tier
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const requestorTier = getRoleTier(requestingUser.role);
    const targetTier = getRoleTier(targetUser.role);

    // 3. Cannot modify users of equal or higher tier (unless you're SUPER_ADMIN)
    if (
      !isOwnNameChange &&
      requestorTier <= targetTier &&
      requestingUser.role !== "SUPER_ADMIN"
    ) {
      return NextResponse.json(
        { error: "You cannot modify a user with an equal or higher role." },
        { status: 403 }
      );
    }

    // 4. Only SUPER_ADMIN can assign SUPER_ADMIN role
    if (role === "SUPER_ADMIN" && requestingUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only Super Administrators can assign the Super Admin role." },
        { status: 403 }
      );
    }

    // 5. Only SUPER_ADMIN can toggle active status
    if (isActive !== undefined && requestingUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          error:
            "Only Super Administrators can activate or deactivate accounts.",
        },
        { status: 403 }
      );
    }

    // 6. Prevent self-demotion for safety
    if (requestingUser.id === id && role && getRoleTier(role) < requestorTier) {
      return NextResponse.json(
        { error: "You cannot demote yourself." },
        { status: 403 }
      );
    }

    if (requestingUser.id === id && isActive === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 403 },
      );
    }

    const nextRole = role ?? targetUser.role;
    const nextSchoolId = schoolId !== undefined ? schoolId : targetUser.schoolId;
    const nextDepartmentId =
      departmentId !== undefined ? departmentId : targetUser.departmentId;

    if (nextRole === "HOD" && !nextDepartmentId) {
      return NextResponse.json(
        { error: "A Head of Department must be assigned to a department." },
        { status: 400 },
      );
    }
    if (nextRole === "DEAN" && !nextSchoolId) {
      return NextResponse.json(
        { error: "A Dean must be assigned to a school." },
        { status: 400 },
      );
    }
    if (nextDepartmentId) {
      const department = await prisma.department.findUnique({
        where: { id: nextDepartmentId },
        select: { schoolId: true },
      });
      if (!department || department.schoolId !== nextSchoolId) {
        return NextResponse.json(
          {
            error:
              "The selected department does not belong to the selected school.",
          },
          { status: 400 },
        );
      }
    }

    if (isActive !== undefined && isActive !== targetUser.isActive) {
      const adminAuthClient = createAdminClient();
      const { data: authData, error: authLookupError } =
        await adminAuthClient.auth.admin.getUserById(targetUser.id);

      if (authLookupError || !authData.user) {
        return NextResponse.json(
          { error: "Unable to update the authentication account." },
          { status: 502 },
        );
      }

      const { error: authUpdateError } =
        await adminAuthClient.auth.admin.updateUserById(targetUser.id, {
          ban_duration: isActive ? "none" : "876000h",
          app_metadata: {
            ...authData.user.app_metadata,
            account_active: isActive,
          },
        });

      if (authUpdateError) {
        return NextResponse.json(
          { error: "Unable to update the authentication account." },
          { status: 502 },
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
        ...(schoolId !== undefined && { schoolId }),
        ...(departmentId !== undefined && { departmentId }),
        ...names,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        schoolId: true,
        departmentId: true,
        school: {
          select: { id: true, name: true, code: true },
        },
        department: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    // Keep the sign-in account's display name in step (not critical).
    if (names.firstName || names.lastName) {
      try {
        await createAdminClient().auth.admin.updateUserById(id, {
          user_metadata: { first_name: user.firstName, last_name: user.lastName },
        });
      } catch (metadataError) {
        console.error("Failed to update auth display name:", metadataError);
      }
    }

    return NextResponse.json(user);
  } catch (error: unknown) {
    console.error("Failed to update user:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}


// DELETE /api/users/[id] - Permanently remove a user (Super Admins only).
// Users with review history can't be deleted; deactivate them instead so the
// audit trail of who submitted, reviewed and commented stays intact.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (auth.user.id === id) {
      return NextResponse.json(
        { error: "You cannot delete your own account." },
        { status: 403 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            submissions: true,
            phaseTransitions: true,
            comments: true,
            reviewCycles: true,
          },
        },
      },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const history = Object.values(target._count).reduce((a, b) => a + b, 0);
    if (history > 0) {
      return NextResponse.json(
        {
          error:
            "This person has review history (submissions, decisions or comments), so they can't be deleted. Deactivate them instead.",
        },
        { status: 409 },
      );
    }

    await prisma.user.delete({ where: { id } });

    // Remove the sign-in account too. If this fails the person still can't
    // get in, because sign-in requires a matching user record.
    const { error: authDeleteError } =
      await createAdminClient().auth.admin.deleteUser(id);
    if (authDeleteError) {
      console.error("Deleted user record but not the auth account:", authDeleteError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete user:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
