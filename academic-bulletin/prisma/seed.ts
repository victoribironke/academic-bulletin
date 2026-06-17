// Disable SSL certificate verification for Supabase connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import "dotenv/config";
import { UserRole } from "@prisma/client";
import prisma from "../lib/prisma";
import { createClient } from "@supabase/supabase-js";

import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("🌱 Starting database seed...\n");

  // Helper to create or fetch user from Supabase and Prisma
  async function seedUser(
    email: string,
    firstName: string,
    lastName: string,
    role: UserRole,
    schoolId: string | null = null,
    departmentId: string | null = null,
  ) {
    let authUserId: string;

    // 1. Create or get user in Supabase Auth
    const { data: createData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: "Password123!",
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
        },
      });

    if (createError) {
      // If user already exists, let's fetch them
      const { data: usersData, error: listError } =
        await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      const existingUser = usersData.users.find((u) => u.email === email);
      if (!existingUser) {
        throw new Error(
          `Failed to create or find user ${email} in Supabase: ${createError.message}`,
        );
      }
      authUserId = existingUser.id;

      // Update the password so the admin knows what it is
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: "Password123!",
      });

      console.log(
        `✅ Supabase Auth: User ${email} already exists (password reset to Password123!).`,
      );
    } else {
      authUserId = createData.user.id;
      console.log(
        `✅ Supabase Auth: Created ${email} with password Password123!`,
      );
    }

    // 2. Upsert in Prisma
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        id: authUserId, // Important: ID must match Supabase Auth ID
        firstName,
        lastName,
        role,
        isActive: true,
        schoolId,
        departmentId,
      },
      create: {
        email,
        id: authUserId, // Important: ID must match Supabase Auth ID
        firstName,
        lastName,
        role,
        isActive: true,
        schoolId,
        departmentId,
      },
    });
    console.log(`✅ Prisma: Synced user ${email} (${role})`);
    return user;
  }

  // ============================================================================
  // Create Super Admin User (Syncing with Supabase Auth)
  // ============================================================================

  await seedUser(
    "super@babcockuniversity.edu.ng",
    "Super",
    "Admin",
    UserRole.SUPER_ADMIN,
    null,
    null,
  );

  console.log("\n✅ Super Admin created successfully");
  console.log("=================================================");
  console.log("🔐 DEFAULT LOGIN CREDENTIALS");
  console.log("=================================================");
  console.log("Please use the following credentials to log in.");
  console.log("It is recommended to change this password after logging in.\n");
  console.log("  Role        | Email                   | Password");
  console.log("  --------------------------------------------------");
  console.log("  Super Admin | super@university.edu    | Password123!");
  console.log("=================================================\n");
  console.log("🌱 Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
