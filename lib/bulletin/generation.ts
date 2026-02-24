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

export interface BulletinCourseDescription {
  learningOutcomes?: string[];
  courseContent?: string;
  labWork?: string;
  entrepreneurialAspect?: string;
}

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
  description?: BulletinCourseDescription;
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
    mission?: string;
    vision?: string;
    objectives?: string[];
    uniqueFeatures?: string[];
    employability?: string;
    centurySkills?: string[];
    utmeRequirements?: string;
    directEntryRequirements?: string;
    transferRequirements?: string;
    minimumDuration?: string;
    graduationRequirements?: string;
    minimumCGPA?: number;
    totalUnits?: number;
  };
}

export interface BulletinData {
  level: ExportLevel;
  title: string;
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
          description: true,
        },
        orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
      },
      content: true,
      courseDescriptions: true,
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
      description: c.description
        ? {
            learningOutcomes: Array.isArray(c.description.learningOutcomes)
              ? (c.description.learningOutcomes as string[])
              : undefined,
            courseContent: c.description.courseContent || undefined,
            labWork: c.description.labWork || undefined,
            entrepreneurialAspect:
              c.description.entrepreneurialAspect || undefined,
          }
        : undefined,
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
          mission: submission.content.mission || undefined,
          vision: submission.content.vision || undefined,
          objectives: Array.isArray(submission.content.objectives)
            ? (submission.content.objectives as string[])
            : undefined,
          uniqueFeatures: Array.isArray(submission.content.uniqueFeatures)
            ? (submission.content.uniqueFeatures as string[])
            : undefined,
          employability: submission.content.employability || undefined,
          centurySkills: Array.isArray(submission.content.centurySkills)
            ? (submission.content.centurySkills as string[])
            : undefined,
          utmeRequirements: submission.content.utmeRequirements || undefined,
          directEntryRequirements:
            submission.content.directEntryRequirements || undefined,
          transferRequirements:
            submission.content.transferRequirements || undefined,
          minimumDuration: submission.content.minimumDuration || undefined,
          graduationRequirements:
            submission.content.graduationRequirements || undefined,
          minimumCGPA: submission.content.minimumCGPA || undefined,
          totalUnits: submission.content.totalUnits || undefined,
        }
      : undefined,
  };

  return {
    level: "department",
    title: `${programme.name} - Academic Bulletin`,
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
export async function generateInstitutionBulletin(): Promise<BulletinData> {
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
    generatedAt: new Date(),
    programmes,
    summary: {
      totalProgrammes: programmes.length,
      totalCourses,
      totalStaff,
    },
  };
}
