/**
 * Creates the first Super Admin and the photo storage bucket.
 *
 * Usage:
 *   SEED_SUPER_ADMIN_EMAIL=you@school.edu SEED_SUPER_ADMIN_PASSWORD=... npm run db:seed
 *
 * Needs DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Safe to re-run: existing users and buckets are reused.
 */
import "dotenv/config";
import { UserRole } from "@prisma/client";
import prisma from "../lib/prisma";
import { createAdminClient } from "../lib/supabase/admin";

const BUCKET_NAME = "staff-photos";

async function createOrGetAuthUser(
  email: string,
  firstName: string,
  lastName: string,
  password: string,
): Promise<string> {
  const supabase = createAdminClient();

  const { data: createData, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

  if (!createError && createData.user) {
    console.log(`✅ Auth: created ${email}`);
    return createData.user.id;
  }

  const { data: usersData, error: listError } =
    await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const existingUser = usersData.users.find((u) => u.email === email);
  if (!existingUser) {
    throw new Error(
      `Failed to create or find user ${email}: ${createError?.message || "unknown error"}`,
    );
  }

  await supabase.auth.admin.updateUserById(existingUser.id, { password });
  console.log(`✅ Auth: ${email} already existed; password updated.`);
  return existingUser.id;
}

async function ensureStorageBucket() {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.storage.getBucket(BUCKET_NAME);
  if (existing) {
    console.log(`✅ Storage: '${BUCKET_NAME}' bucket already exists.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: 4 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error) throw error;
  console.log(`✅ Storage: created '${BUCKET_NAME}' bucket.`);
}

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD before seeding.",
    );
  }
  if (password.length < 12) {
    throw new Error("SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  }

  console.log("🌱 Starting database seed...\n");

  const authUserId = await createOrGetAuthUser(
    email,
    "Super",
    "Admin",
    password,
  );

  const profile = {
    id: authUserId,
    firstName: "Super",
    lastName: "Admin",
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    schoolId: null,
    departmentId: null,
  };
  const user = await prisma.user.upsert({
    where: { email },
    update: profile,
    create: { email, ...profile },
  });
  console.log(`✅ Database: synced ${user.email} (${user.role})`);

  await ensureStorageBucket();

  console.log(`\n🌱 Done. Sign in as ${email} with the password you supplied.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
