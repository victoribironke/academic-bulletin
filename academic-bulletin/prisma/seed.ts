// Disable SSL certificate verification for Supabase connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import "dotenv/config";
import { UserRole } from "@prisma/client";
import prisma from "../lib/prisma";
import { createClient } from "@supabase/supabase-js";

async function createOrGetAuthUser(
  email: string,
  firstName: string,
  lastName: string,
  password = "Password123!",
): Promise<string> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // 1. Direct GoTrue REST probe (works inside Docker network & localhost)
  const directEndpoints = ["http://auth:9999", "http://127.0.0.1:9999"];

  for (const base of directEndpoints) {
    try {
      const healthCheck = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (healthCheck.ok) {
        // Try creating user directly
        const createRes = await fetch(`${base}/admin/users`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { first_name: firstName, last_name: lastName },
          }),
        });

        if (createRes.ok) {
          const data = (await createRes.json()) as { id: string };
          console.log(`✅ GoTrue Auth: Created ${email} (ID: ${data.id})`);
          return data.id;
        }

        // User may already exist — fetch user list to find ID
        const listRes = await fetch(`${base}/admin/users`, {
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
        });

        if (listRes.ok) {
          const listData = (await listRes.json()) as {
            users?: Array<{ id: string; email: string }>;
          };
          const existing = listData.users?.find((u) => u.email === email);
          if (existing) {
            // Update password
            await fetch(`${base}/admin/users/${existing.id}`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ password }),
            });
            console.log(
              `✅ GoTrue Auth: User ${email} already exists (password reset to ${password}).`,
            );
            return existing.id;
          }
        }
      }
    } catch {
      // Continue to next probe or fallback
    }
  }

  // 2. Fallback to Supabase SDK client (Supabase Cloud or external proxy)
  const targetUrl =
    process.env.INTERNAL_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "http://127.0.0.1:3000";

  const supabaseAdmin = createClient(targetUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: createData, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

  if (!createError && createData.user) {
    console.log(`✅ Supabase Auth SDK: Created ${email}`);
    return createData.user.id;
  }

  const { data: usersData, error: listError } =
    await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;

  const existingUser = usersData.users.find((u) => u.email === email);
  if (!existingUser) {
    throw new Error(
      `Failed to create or find user ${email}: ${createError?.message || "unknown error"}`,
    );
  }

  await supabaseAdmin.auth.admin.updateUserById(existingUser.id, { password });
  console.log(`✅ Supabase Auth SDK: User ${email} password reset.`);
  return existingUser.id;
}

async function ensureStorageBucket() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const endpoints = ["http://storage:5000", "http://127.0.0.1:5000"];

  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        await fetch(`${base}/bucket`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: "staff-photos",
            name: "staff-photos",
            public: true,
            file_size_limit: 5242880,
            allowed_mime_types: [
              "image/jpeg",
              "image/png",
              "image/webp",
            ],
          }),
        });
        console.log("✅ Storage API: 'staff-photos' bucket verified/created.");
        return;
      }
    } catch {
      // Storage might not be reachable from this environment, ignore
    }
  }
}

async function main() {
  console.log("🌱 Starting database seed...\n");

  const authUserId = await createOrGetAuthUser(
    "super@university.edu",
    "Super",
    "Admin",
    "Password123!",
  );

  // Sync with Prisma PostgreSQL database
  const user = await prisma.user.upsert({
    where: { email: "super@university.edu" },
    update: {
      id: authUserId,
      firstName: "Super",
      lastName: "Admin",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      schoolId: null,
      departmentId: null,
    },
    create: {
      email: "super@university.edu",
      id: authUserId,
      firstName: "Super",
      lastName: "Admin",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      schoolId: null,
      departmentId: null,
    },
  });

  console.log(`✅ Prisma: Synced user ${user.email} (${user.role})`);

  // Ensure storage bucket exists
  await ensureStorageBucket();

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
