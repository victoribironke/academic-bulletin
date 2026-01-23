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
  // 3. Create Staff
  // ============================================================================
  const prof = await prisma.staff.create({
    data: {
      title: "PROF",
      surname: "Oladele",
      firstName: "James",
      gender: "MALE",
      highestQualification: "PHD",
      academicRank: "PROFESSOR",
      specialization: "Artificial Intelligence",
      email: "james.oladele@university.edu",
      type: "ACADEMIC",
      isActive: true,
      departmentId: department.id,
    },
  });
  console.log(`✅ Staff: ${prof.title} ${prof.surname}`);

  const lecturer = await prisma.staff.create({
    data: {
      title: "DR",
      surname: "Adesina",
      firstName: "Mary",
      gender: "FEMALE",
      highestQualification: "PHD",
      academicRank: "SENIOR_LECTURER",
      specialization: "Software Engineering",
      email: "mary.adesina@university.edu",
      type: "ACADEMIC",
      isActive: true,
      departmentId: department.id,
    },
  });
  console.log(`✅ Staff: ${lecturer.title} ${lecturer.surname}`);

  // ============================================================================
  // 4. Create Master Courses
  // ============================================================================
  const course1 = await prisma.masterCourse.upsert({
    where: { code: "COS 101" },
    update: {},
    create: {
      code: "COS 101",
      title: "Introduction to computing sciences",
      units: 2,
      type: "CORE",
      ownership: "DEPARTMENT",
      level: 100,
      semester: 1,
      ownerDeptId: department.id,
    },
  });

  const course2 = await prisma.masterCourse.upsert({
    where: { code: "GDS 101" },
    update: {},
    create: {
      code: "GDS 101",
      title: "Communication skills",
      units: 2,
      type: "GENERAL",
      ownership: "INSTITUTIONAL",
      level: 100,
      semester: 1,
    },
  });
  console.log(`✅ Master Courses created`);

  // ============================================================================
  // 5. Create Programme
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
  // 6. Link Courses to Programme
  // ============================================================================
  await prisma.programmeCourse.createMany({
    data: [
      { programmeId: programme.id, courseId: course1.id, isCore: true },
      { programmeId: programme.id, courseId: course2.id, isCore: true },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ Linked courses to programme`);

  // ============================================================================
  // 7. Create Users
  // ============================================================================

  // Coordinator
  await prisma.user.upsert({
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

  // HOD
  await prisma.user.upsert({
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

  // Dean
  await prisma.user.upsert({
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
      departmentId: null,
    },
  });

  // Admin
  await prisma.user.upsert({
    where: { email: "admin@university.edu" },
    update: {},
    create: {
      email: "admin@university.edu",
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      firstName: "Sarah",
      lastName: "Admin",
      role: UserRole.ADMIN,
      isActive: true,
      schoolId: null,
      departmentId: null,
    },
  });

  // Super Admin
  await prisma.user.upsert({
    where: { email: "super@university.edu" },
    update: {},
    create: {
      email: "super@university.edu",
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      firstName: "Super",
      lastName: "Admin",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      schoolId: null,
      departmentId: null,
    },
  });

  console.log("✅ Users created");
  console.log("\n🌱 Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
