// Disable SSL certificate verification for Supabase connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "@prisma/client";

// Initialize Prisma Client with adapter
const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Placeholder password hash (represents "password123")
// In production, use bcrypt to generate real hashes
const PLACEHOLDER_PASSWORD_HASH =
  "$2b$10$placeholder.hash.for.testing.only.do.not.use.in.production";

async function main() {
  console.log("🌱 Starting database seed...\n");

  // ============================================================================
  // 1. Create School
  // ============================================================================
  const school = await prisma.school.upsert({
    where: { code: "SOC" },
    update: {},
    create: {
      name: "School of Computing",
      code: "SOC",
      description:
        "The School of Computing offers cutting-edge programmes in computer science, software engineering, and information technology.",
    },
  });
  console.log(`✅ School: ${school.name} (${school.code})`);

  // ============================================================================
  // 2. Create Department
  // ============================================================================
  const department = await prisma.department.upsert({
    where: { code: "CS" },
    update: {},
    create: {
      name: "Computer Science",
      code: "CS",
      description:
        "The Department of Computer Science focuses on theoretical foundations and practical applications of computing.",
      schoolId: school.id,
    },
  });
  console.log(`✅ Department: ${department.name} (${department.code})`);

  // ============================================================================
  // 3. Create Programme
  // ============================================================================
  const programme = await prisma.programme.upsert({
    where: { code: "BSC-SE" },
    update: {},
    create: {
      name: "B.Sc. Software Engineering",
      code: "BSC-SE",
      description:
        "A comprehensive undergraduate programme covering software development, system design, and engineering principles.",
      degreeType: "BSc",
      duration: 4,
      departmentId: department.id,
    },
  });
  console.log(`✅ Programme: ${programme.name} (${programme.code})`);

  // ============================================================================
  // 4. Create Users
  // ============================================================================

  // Coordinator - linked to the Department (manages Programme submissions)
  const coordinator = await prisma.user.upsert({
    where: { email: "coordinator@university.edu" },
    update: {},
    create: {
      email: "coordinator@university.edu",
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      firstName: "John",
      lastName: "Coordinator",
      role: UserRole.COORDINATOR,
      isActive: true,
      schoolId: school.id,
      departmentId: department.id,
    },
  });
  console.log(
    `✅ User: ${coordinator.firstName} ${coordinator.lastName} (${coordinator.role})`
  );

  // HOD - linked to the Department
  const hod = await prisma.user.upsert({
    where: { email: "hod@university.edu" },
    update: {},
    create: {
      email: "hod@university.edu",
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      firstName: "Jane",
      lastName: "HeadOfDepartment",
      role: UserRole.HOD,
      isActive: true,
      schoolId: school.id,
      departmentId: department.id,
    },
  });
  console.log(`✅ User: ${hod.firstName} ${hod.lastName} (${hod.role})`);

  // Dean - linked to the School
  const dean = await prisma.user.upsert({
    where: { email: "dean@university.edu" },
    update: {},
    create: {
      email: "dean@university.edu",
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      firstName: "Robert",
      lastName: "Dean",
      role: UserRole.DEAN,
      isActive: true,
      schoolId: school.id,
      departmentId: null, // Dean is at School level, not Department
    },
  });
  console.log(`✅ User: ${dean.firstName} ${dean.lastName} (${dean.role})`);

  // Admin - Academic Planning (no specific School/Department)
  const admin = await prisma.user.upsert({
    where: { email: "admin@university.edu" },
    update: {},
    create: {
      email: "admin@university.edu",
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      firstName: "Sarah",
      lastName: "Admin",
      role: UserRole.ADMIN,
      isActive: true,
      schoolId: null, // Admin is university-wide
      departmentId: null,
    },
  });
  console.log(`✅ User: ${admin.firstName} ${admin.lastName} (${admin.role})`);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(50));
  console.log("🎉 Database seeded successfully!");
  console.log("=".repeat(50));
  console.log(`
  📊 Created:
     • 1 School: ${school.name}
     • 1 Department: ${department.name}
     • 1 Programme: ${programme.name}
     • 4 Users: Coordinator, HOD, Dean, Admin
  
  🔐 All users have the placeholder password hash.
     Replace with real bcrypt hashes before production.
  `);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
