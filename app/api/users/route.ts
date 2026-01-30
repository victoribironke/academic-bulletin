import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // const users = await prisma.user.findMany({ ... });
    const users: any[] = []; // Mock empty DB result to trigger fallback
    console.log("Skipping DB fetch, using hardcoded users");

    if (!users || users.length === 0) {
      console.log("Database empty, returning hardcoded mock users");
      const mockUsers = [
        {
          id: "user_admin",
          email: "admin@university.edu",
          firstName: "Sarah",
          lastName: "Admin",
          role: "ADMIN",
          isActive: true,
          schoolId: null,
          departmentId: null
        },
        {
          id: "user_super",
          email: "super@university.edu",
          firstName: "Super",
          lastName: "Admin",
          role: "SUPER_ADMIN",
          isActive: true,
          schoolId: null,
          departmentId: null
        },
        {
          id: "user_dean",
          email: "dean@university.edu",
          firstName: "Robert",
          lastName: "Dean",
          role: "DEAN",
          isActive: true,
          schoolId: "school_soc",
          departmentId: null
        },
        {
          id: "user_hod",
          email: "hod@university.edu",
          firstName: "Jane",
          lastName: "HeadOfDepartment",
          role: "HOD",
          isActive: true,
          schoolId: "school_soc",
          departmentId: "dept_cs"
        },
        {
          id: "user_coord",
          email: "coordinator@university.edu",
          firstName: "John",
          lastName: "Coordinator",
          role: "COORDINATOR",
          isActive: true,
          schoolId: "school_soc",
          departmentId: "dept_cs"
        }
      ];
      return NextResponse.json(mockUsers);
    }

    return NextResponse.json(users);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
