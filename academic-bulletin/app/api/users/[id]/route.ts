import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/users/[id] - Get a single user
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    let user = await prisma.user.findUnique({
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

    // Auto-sync fallback: If Prisma user record is missing, check auth session and auto-provision
    if (!user) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser && (authUser.id === id || authUser.email === id)) {
        const isSuper = authUser.email === "super@university.edu";
        user = await prisma.user.upsert({
          where: { email: authUser.email! },
          update: {
            id: authUser.id,
            isActive: true,
          },
          create: {
            id: authUser.id,
            email: authUser.email!,
            firstName:
              authUser.user_metadata?.first_name ||
              (isSuper ? "Super" : "User"),
            lastName:
              authUser.user_metadata?.last_name || (isSuper ? "Admin" : ""),
            role: isSuper ? "SUPER_ADMIN" : "HOD",
            isActive: true,
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
      }
    }

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

// PATCH /api/users/[id] - Update a user (role, active status, etc.)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { role, isActive, schoolId, departmentId } = body;

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

    if (
      !requestingUser ||
      getRoleTier(requestingUser.role) < getRoleTier("ADMIN")
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
    if (requestorTier <= targetTier && requestingUser.role !== "SUPER_ADMIN") {
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

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
        ...(schoolId !== undefined && { schoolId }),
        ...(departmentId !== undefined && { departmentId }),
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

