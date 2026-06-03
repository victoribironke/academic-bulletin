process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import seedData from "./seed-data.json";

// Use the same Prisma setup as the main app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 1,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface Programme {
  name: string;
  code: string;
  degreeType: string;
  duration: number;
}

interface Department {
  name: string;
  code: string;
  programmes: Programme[];
}

interface School {
  name: string;
  code: string;
  college?: string;
  departments: Department[];
}

interface SeedData {
  schools: School[];
}

async function main() {
  const data = seedData as SeedData;

  console.log("=== Academic Bulletin Platform Seeder ===\n");
  console.log(`Found ${data.schools.length} schools to seed.\n`);

  let schoolCount = 0;
  let deptCount = 0;
  let progCount = 0;

  for (const schoolData of data.schools) {
    // Upsert school
    const school = await prisma.school.upsert({
      where: { code: schoolData.code },
      update: { name: schoolData.name },
      create: { name: schoolData.name, code: schoolData.code },
    });
    schoolCount++;
    console.log(`✓ School: ${school.name} [${school.code}]`);

    for (const deptData of schoolData.departments) {
      // Build a globally unique department code: SCHOOLCODE-DEPTCODE
      const fullDeptCode = `${schoolData.code}-${deptData.code}`;

      const dept = await prisma.department.upsert({
        where: { code: fullDeptCode },
        update: { name: deptData.name, schoolId: school.id },
        create: {
          name: deptData.name,
          code: fullDeptCode,
          schoolId: school.id,
        },
      });
      deptCount++;
      console.log(`  ├─ Department: ${dept.name} [${dept.code}]`);

      for (const progData of deptData.programmes) {
        // Build a globally unique programme code: DEPTCODE-PROGCODE
        const fullProgCode = `${fullDeptCode}-${progData.code}`;

        const prog = await prisma.programme.upsert({
          where: { code: fullProgCode },
          update: {
            name: progData.name,
            degreeType: progData.degreeType,
            duration: progData.duration,
            departmentId: dept.id,
          },
          create: {
            name: progData.name,
            code: fullProgCode,
            degreeType: progData.degreeType,
            duration: progData.duration,
            departmentId: dept.id,
          },
        });
        progCount++;
        console.log(`  │  └─ Programme: ${prog.name} (${progData.degreeType}) [${prog.code}]`);
      }
    }
    console.log("");
  }

  console.log("=== Seeding Complete ===");
  console.log(`  Schools:     ${schoolCount}`);
  console.log(`  Departments: ${deptCount}`);
  console.log(`  Programmes:  ${progCount}`);
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
