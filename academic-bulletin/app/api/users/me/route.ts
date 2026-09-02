import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized" },
        { status: 500 },
      );
    }

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ id: authUser.id }, { email: authUser.email! }],
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

    // Auto-provision Super Admin or initial profile if not in Prisma yet
    if (!user) {
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
            authUser.user_metadata?.first_name || (isSuper ? "Super" : "User"),
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

    return NextResponse.json(user);
  } catch (error) {
    console.error("Failed to fetch current user session:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

