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

    const user = await prisma.user.findFirst({
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

    if (!user) {
      await supabase.auth.signOut({ scope: "global" });
      return NextResponse.json(
        { error: "Account is not provisioned" },
        { status: 403 },
      );
    }

    if (!user.isActive) {
      await supabase.auth.signOut({ scope: "global" });
      return NextResponse.json(
        { error: "Account deactivated" },
        { status: 403 },
      );
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

