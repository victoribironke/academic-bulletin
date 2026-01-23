/**
 * Bulletin Generation Utilities
 *
 * Handles generation of bulletins at three levels:
 * - Department: Single programme bulletin
 * - School: All programmes in a school
 * - Institution: All programmes across institution
 */

import prisma from "@/lib/prisma";
import {
  formatStaffName,
  getTitleDisplay,
  getAcademicRankDisplay,
} from "@/lib/validation/name-format";

// Types
export type ExportLevel = "department" | "school" | "institution";

export interface BulletinCourse {
  code: string;
  title: string;
  units: number;
  status: string;
  semester: number;
  level: number;
  prerequisites?: string;
  ownership?: string;
  ownerDepartment?: string;
}

export interface BulletinStaff {
  id: string;
  fullName: string;
  title: string;
  rank: string;
  qualification: string;
  specialization?: string;
  email?: string;
  type: string;
}

export interface BulletinProgramme {
  id: string;
  name: string;
  code: string;
  degreeType?: string;
  department: string;
  departmentCode: string;
  school: string;
  schoolCode: string;
  courses: BulletinCourse[];
  staff: BulletinStaff[];
  content?: {
    philosophy?: string;
    aims?: string[];
    objectives?: string[];
    admissionRequirements?: string[];
    graduationRequirements?: string;
  };
}

export interface BulletinData {
  level: ExportLevel;
  title: string;
  academicYear: string;
  generatedAt: Date;
  programmes: BulletinProgramme[];
  summary: {
    totalProgrammes: number;
    totalCourses: number;
    totalStaff: number;
  };
}

/**
 * Generate bulletin data for a single programme (department level)
 */
// Update signature
export async function generateDepartmentBulletin(
  programmeId: string,
  academicYear: string,
  submissionId?: string,
): Promise<BulletinData> {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    include: {
      department: {
        include: {
          school: true,
          staff: true,
        },
      },
    },
  });

  if (!programme) {
    throw new Error("Programme not found");
  }

  // Get submission - either specific ID or latest approved
  const submission = await prisma.submission.findFirst({
    where: submissionId
      ? { id: submissionId }
      : {
          programmeId,
          academicYear,
          status: "APPROVED",
        },
    include: {
      courses: {
        include: {
          masterCourse: {
            select: {
              ownership: true,
              ownerDepartment: { select: { code: true } },
            },
          },
        },
        orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
      },
      content: true,
    },
  });

  // Format staff with new structured fields
  const formattedStaff: BulletinStaff[] = programme.department.staff.map(
    (s) => ({
      id: s.id,
      fullName: formatStaffName({
        title: s.title,
        surname: s.surname,
        firstName: s.firstName,
        middleName: s.middleName,
      }),
      title: getTitleDisplay(s.title),
      rank: getAcademicRankDisplay(s.academicRank),
      qualification: s.highestQualification,
      specialization: s.specialization || undefined,
      email: s.email || undefined,
      type: s.type,
    }),
  );

  // Format courses
  const formattedCourses: BulletinCourse[] = (submission?.courses || []).map(
    (c) => ({
      code: c.code,
      title: c.title,
      units: c.units,
      status: c.status,
      semester: c.semester,
      level: c.level,
      prerequisites: c.prerequisites || undefined,
      ownership: c.masterCourse?.ownership,
      ownerDepartment: c.masterCourse?.ownerDepartment?.code,
    }),
  );

  const bulletinProgramme: BulletinProgramme = {
    id: programme.id,
    name: programme.name,
    code: programme.code,
    degreeType: programme.degreeType || undefined,
    department: programme.department.name,
    departmentCode: programme.department.code,
    school: programme.department.school.name,
    schoolCode: programme.department.school.code,
    courses: formattedCourses,
    staff: formattedStaff,
    content: submission?.content
      ? {
          philosophy: submission.content.philosophy || undefined,
          objectives: Array.isArray(submission.content.objectives)
            ? (submission.content.objectives as string[])
            : undefined,
          admissionRequirements: submission.content.utmeRequirements
            ? [submission.content.utmeRequirements]
            : undefined,
          graduationRequirements:
            submission.content.graduationRequirements || undefined,
        }
      : undefined,
  };

  return {
    level: "department",
    title: `${programme.name} - Academic Bulletin`,
    academicYear,
    generatedAt: new Date(),
    programmes: [bulletinProgramme],
    summary: {
      totalProgrammes: 1,
      totalCourses: formattedCourses.length,
      totalStaff: formattedStaff.length,
    },
  };
}

/**
 * Generate bulletin data for all programmes in a school
 */
export async function generateSchoolBulletin(
  schoolId: string,
  academicYear: string,
): Promise<BulletinData> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      departments: {
        include: {
          programmes: true,
          staff: true,
        },
      },
    },
  });

  if (!school) {
    throw new Error("School not found");
  }

  const programmes: BulletinProgramme[] = [];
  let totalCourses = 0;
  let totalStaff = 0;

  for (const dept of school.departments) {
    for (const prog of dept.programmes) {
      // Get approved submission
      const submission = await prisma.submission.findFirst({
        where: {
          programmeId: prog.id,
          academicYear,
          status: "APPROVED",
        },
        include: {
          courses: {
            include: {
              masterCourse: {
                select: {
                  ownership: true,
                  ownerDepartment: { select: { code: true } },
                },
              },
            },
            orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
          },
          content: true,
        },
      });

      const formattedStaff: BulletinStaff[] = dept.staff.map((s) => ({
        id: s.id,
        fullName: formatStaffName({
          title: s.title,
          surname: s.surname,
          firstName: s.firstName,
          middleName: s.middleName,
        }),
        title: getTitleDisplay(s.title),
        rank: getAcademicRankDisplay(s.academicRank),
        qualification: s.highestQualification,
        specialization: s.specialization || undefined,
        email: s.email || undefined,
        type: s.type,
      }));

      const formattedCourses: BulletinCourse[] = (
        submission?.courses || []
      ).map((c) => ({
        code: c.code,
        title: c.title,
        units: c.units,
        status: c.status,
        semester: c.semester,
        level: c.level,
        prerequisites: c.prerequisites || undefined,
        ownership: c.masterCourse?.ownership,
        ownerDepartment: c.masterCourse?.ownerDepartment?.code,
      }));

      programmes.push({
        id: prog.id,
        name: prog.name,
        code: prog.code,
        degreeType: prog.degreeType || undefined,
        department: dept.name,
        departmentCode: dept.code,
        school: school.name,
        schoolCode: school.code,
        courses: formattedCourses,
        staff: formattedStaff,
        content: submission?.content
          ? {
              philosophy: submission.content.philosophy || undefined,
              objectives: Array.isArray(submission.content.objectives)
                ? (submission.content.objectives as string[])
                : undefined,
              graduationRequirements:
                submission.content.graduationRequirements || undefined,
            }
          : undefined,
      });

      totalCourses += formattedCourses.length;
    }
    totalStaff += dept.staff.length;
  }

  return {
    level: "school",
    title: `${school.name} - Academic Bulletin`,
    academicYear,
    generatedAt: new Date(),
    programmes,
    summary: {
      totalProgrammes: programmes.length,
      totalCourses,
      totalStaff,
    },
  };
}

/**
 * Generate bulletin data for entire institution
 */
export async function generateInstitutionBulletin(
  academicYear: string,
): Promise<BulletinData> {
  const schools = await prisma.school.findMany({
    include: {
      departments: {
        include: {
          programmes: true,
          staff: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const programmes: BulletinProgramme[] = [];
  let totalCourses = 0;
  let totalStaff = 0;

  for (const school of schools) {
    for (const dept of school.departments) {
      for (const prog of dept.programmes) {
        const submission = await prisma.submission.findFirst({
          where: {
            programmeId: prog.id,
            academicYear,
            status: "APPROVED",
          },
          include: {
            courses: {
              include: {
                masterCourse: {
                  select: {
                    ownership: true,
                    ownerDepartment: { select: { code: true } },
                  },
                },
              },
              orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
            },
            content: true,
          },
        });

        const formattedStaff: BulletinStaff[] = dept.staff.map((s) => ({
          id: s.id,
          fullName: formatStaffName({
            title: s.title,
            surname: s.surname,
            firstName: s.firstName,
            middleName: s.middleName,
          }),
          title: getTitleDisplay(s.title),
          rank: getAcademicRankDisplay(s.academicRank),
          qualification: s.highestQualification,
          specialization: s.specialization || undefined,
          email: s.email || undefined,
          type: s.type,
        }));

        const formattedCourses: BulletinCourse[] = (
          submission?.courses || []
        ).map((c) => ({
          code: c.code,
          title: c.title,
          units: c.units,
          status: c.status,
          semester: c.semester,
          level: c.level,
          prerequisites: c.prerequisites || undefined,
          ownership: c.masterCourse?.ownership,
          ownerDepartment: c.masterCourse?.ownerDepartment?.code,
        }));

        programmes.push({
          id: prog.id,
          name: prog.name,
          code: prog.code,
          degreeType: prog.degreeType || undefined,
          department: dept.name,
          departmentCode: dept.code,
          school: school.name,
          schoolCode: school.code,
          courses: formattedCourses,
          staff: formattedStaff,
          content: submission?.content
            ? {
                philosophy: submission.content.philosophy || undefined,
                graduationRequirements:
                  submission.content.graduationRequirements || undefined,
              }
            : undefined,
        });

        totalCourses += formattedCourses.length;
      }
      totalStaff += dept.staff.length;
    }
  }

  return {
    level: "institution",
    title: "Babcock University - Academic Bulletin",
    academicYear,
    generatedAt: new Date(),
    programmes,
    summary: {
      totalProgrammes: programmes.length,
      totalCourses,
      totalStaff,
    },
  };
}
