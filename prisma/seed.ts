/**
 * Creates the first Super Admin.
 *
 * Usage:
 *   SEED_SUPER_ADMIN_EMAIL=you@babcock.edu.ng bun run db:seed
 *
 * The Super Admin then signs in with the Google account that uses this email.
 *
 * Needs DATABASE_URL. Safe to re-run: an existing user keeps their id.
 * The photo bucket is created in Railway, not here.
 */
import "../lib/load-env";
import { randomUUID } from "node:crypto";
import { UserRole } from "@prisma/client";
import prisma from "../lib/prisma";
import { isUniversityEmail, UNIVERSITY_DOMAIN } from "../lib/sign-in-access";

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error("Set SEED_SUPER_ADMIN_EMAIL before seeding.");
  }
  if (!isUniversityEmail(email)) {
    throw new Error(`SEED_SUPER_ADMIN_EMAIL must be a ${UNIVERSITY_DOMAIN} address.`);
  }

  console.log("🌱 Starting database seed...\n");

  const profile = {
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
    create: { id: randomUUID(), email, ...profile },
  });
  console.log(`✅ Database: synced ${user.email} (${user.role})`);

  console.log(`\n🌱 Done. Sign in with the Google account for ${email}.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
