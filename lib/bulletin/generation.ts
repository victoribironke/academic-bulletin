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
  staffRankLabel,
} from "@/lib/validation/name-format";
import { NOT_IN_ARCHIVED_CYCLE } from "@/lib/cycles/archive";
import { COURSE_OWNER_SELECT, type ProgrammePlace, isOwnedElsewhere } from "@/lib/courses/shared-courses";
import { isGeneralEducationCourse } from "@/lib/courses/general-education";
import { type Leaders, resolveLeaders } from "@/lib/leaders";

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
  /** 1, 2, or null for a sessional course with no semester (B13). */
  semester: number | null;
  level: number;
  prerequisites?: string;
  ownership?: string;
  ownerDepartment?: string;
  description?: BulletinCourseDescription;
  /** W4: General Education, and taught by the programme's own department. */
  generalEducation?: boolean;
  owned?: boolean;
  /** W2 and W15: contact hours a semester. */
  lectureHours?: number | null;
  practicalHours?: number | null;
  /** W3: the elective group the course belongs to. */
  electiveGroupId?: string | null;
}

export interface BulletinStaff {
  id: string;
  fullName: string;
  title: string;
  rank: string;
  qualification: string;
  specialization?: string;
  email?: string;
  imageUrl?: string;
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
  submissionStatus?: string;
  courses: BulletinCourse[];
  /** E4 and Q4: the Dean and Head of Department, printed with their photos. */
  leaders?: Leaders;
  /** W3: named elective groups; the totals count what a student chooses. */
  electiveGroups?: { id: string; name: string; chooseUnits: number }[];
  staff: BulletinStaff[];
  content?: {
    deanImageUrl?: string;
    hodImageUrl?: string;
    sectionF?: { content?: string };
    sectionG?: { content?: string };
    philosophy?: string;
    mission?: string;
    vision?: string;
    objectives?: string[];
    uniqueFeatures?: string[];
    employability?: string[];
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
  /** W14: the university's vision and mission (DAP's wording), printed first on every programme page. */
  university?: { vision: string | null; mission: string | null } | null;
}


/** The Registry owner of each course, for its department code and for W4. */
const BULLETIN_OWNER_SELECT = {
  ...COURSE_OWNER_SELECT,
  ownerDepartment: { select: { code: true, name: true } },
} as const;

type CourseRow = {
  code: string;
  title: string;
  units: number;
  status: string;
  semester: number | null;
  level: number;
  prerequisites: string | null;
  lectureHours: number | null;
  practicalHours: number | null;
  electiveGroupId: string | null;
  masterCourse: {
    type: string;
    ownership: string;
    ownerDeptId: string | null;
    ownerSchoolId: string | null;
    ownerDepartment: { code: string; name: string } | null;
    ownerSchool: { name: string } | null;
  } | null;
  description: {
    learningOutcomes: unknown;
    courseContent: string | null;
    labWork: string | null;
    entrepreneurialAspect: string | null;
  } | null;
};

/** One course as the bulletin prints it. */
function toBulletinCourse(c: CourseRow, place: ProgrammePlace): BulletinCourse {
  return {
    code: c.code,
    title: c.title,
    units: c.units,
    status: c.status,
    semester: c.semester,
    level: c.level,
    prerequisites: c.prerequisites || undefined,
    ownership: c.masterCourse?.ownership,
    ownerDepartment: c.masterCourse?.ownerDepartment?.code,
    generalEducation: isGeneralEducationCourse(c),
    owned: !isOwnedElsewhere(c, place),
    lectureHours: c.lectureHours,
    practicalHours: c.practicalHours,
    electiveGroupId: c.electiveGroupId,
    description: c.description
      ? {
          learningOutcomes: Array.isArray(c.description.learningOutcomes)
            ? (c.description.learningOutcomes as string[])
            : undefined,
          courseContent: c.description.courseContent || undefined,
          labWork: c.description.labWork || undefined,
          entrepreneurialAspect: c.description.entrepreneurialAspect || undefined,
        }
      : undefined,
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
          AND: [NOT_IN_ARCHIVED_CYCLE],
        },
    include: {
      courses: {
        include: {
          masterCourse: { select: BULLETIN_OWNER_SELECT },
          description: true,
        },
        orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
      },
      content: true,
      courseDescriptions: true,
      electiveGroups: { select: { id: true, name: true, chooseUnits: true } },
    },
  });

  // Format staff with new structured fields
  const formattedStaff: BulletinStaff[] = programme.department.staff
    .filter((s) => s.isActive)
    .map(
    (s) => ({
      id: s.id,
      fullName: formatStaffName({
        title: s.title,
        surname: s.surname,
        firstName: s.firstName,
        middleName: s.middleName,
      }),
      title: getTitleDisplay(s.title),
      rank: staffRankLabel(s),
      qualification: s.highestQualification,
      specialization: s.specialization || undefined,
      email: s.email || undefined,
      imageUrl: s.imageUrl || undefined,
      type: s.type,
    }),
  );

  // Format courses
  const formattedCourses: BulletinCourse[] = (submission?.courses || []).map((c) =>
    toBulletinCourse(c, { departmentId: programme.departmentId, schoolId: programme.department.schoolId }),
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
    submissionStatus: submission?.status,
    courses: formattedCourses,
    electiveGroups: submission?.electiveGroups ?? [],
    staff: formattedStaff,
    // E4 and Q4: the Dean and Head from the school and department records.
    leaders: resolveLeaders(programme.department.school, programme.department, submission?.content?.programmeInfo),
    content: submission?.content
      ? {
          deanImageUrl: (submission.content.programmeInfo as any)?.deanImageUrl || undefined,
          hodImageUrl: (submission.content.programmeInfo as any)?.hodImageUrl || undefined,
          sectionF: submission.content.sectionF ? { content: (submission.content.sectionF as any).content } : undefined,
          sectionG: submission.content.sectionG ? { content: (submission.content.sectionG as any).content } : undefined,
          philosophy: submission.content.philosophy || undefined,
          mission: submission.content.mission || undefined,
          vision: submission.content.vision || undefined,
          objectives: Array.isArray(submission.content.objectives)
            ? (submission.content.objectives as string[])
            : undefined,
          uniqueFeatures: Array.isArray(submission.content.uniqueFeatures)
            ? (submission.content.uniqueFeatures as string[])
            : undefined,
          employability: Array.isArray(submission.content.employability)
            ? (submission.content.employability as string[])
            : submission.content.employability
              ? [(submission.content.employability as string)]
              : undefined,
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
          AND: [NOT_IN_ARCHIVED_CYCLE],
        },
        include: {
          courses: {
            include: {
              masterCourse: { select: BULLETIN_OWNER_SELECT },
              description: true,
            },
            orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
          },
          content: true,
          courseDescriptions: true,
          electiveGroups: { select: { id: true, name: true, chooseUnits: true } },
        },
      });

      const formattedStaff: BulletinStaff[] = dept.staff
        .filter((s) => s.isActive)
        .map((s) => ({
        id: s.id,
        fullName: formatStaffName({
          title: s.title,
          surname: s.surname,
          firstName: s.firstName,
          middleName: s.middleName,
        }),
        title: getTitleDisplay(s.title),
        rank: staffRankLabel(s),
        qualification: s.highestQualification,
        specialization: s.specialization || undefined,
        email: s.email || undefined,
        imageUrl: s.imageUrl || undefined,
        type: s.type,
      }));

      const formattedCourses: BulletinCourse[] = (submission?.courses || []).map((c) =>
        toBulletinCourse(c, { departmentId: dept.id, schoolId: school.id }),
      );

      programmes.push({
        id: prog.id,
        name: prog.name,
        code: prog.code,
        degreeType: prog.degreeType || undefined,
        department: dept.name,
        departmentCode: dept.code,
        school: school.name,
        schoolCode: school.code,
        submissionStatus: submission?.status,
        courses: formattedCourses,
        electiveGroups: submission?.electiveGroups ?? [],
        staff: formattedStaff,
        // E4 and Q4: the Dean and Head from the school and department records.
        leaders: resolveLeaders(school, dept, submission?.content?.programmeInfo),
        content: submission?.content
          ? {
              deanImageUrl: (submission.content.programmeInfo as any)?.deanImageUrl || undefined,
              hodImageUrl: (submission.content.programmeInfo as any)?.hodImageUrl || undefined,
              sectionF: submission.content.sectionF ? { content: (submission.content.sectionF as any).content } : undefined,
              sectionG: submission.content.sectionG ? { content: (submission.content.sectionG as any).content } : undefined,
              philosophy: submission.content.philosophy || undefined,
              mission: submission.content.mission || undefined,
              vision: submission.content.vision || undefined,
              objectives: Array.isArray(submission.content.objectives)
                ? (submission.content.objectives as string[])
                : undefined,
              uniqueFeatures: Array.isArray(submission.content.uniqueFeatures)
                ? (submission.content.uniqueFeatures as string[])
                : undefined,
              employability: Array.isArray(submission.content.employability)
            ? (submission.content.employability as string[])
            : submission.content.employability
              ? [(submission.content.employability as string)]
              : undefined,
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
            AND: [NOT_IN_ARCHIVED_CYCLE],
          },
          include: {
            courses: {
              include: {
                masterCourse: { select: BULLETIN_OWNER_SELECT },
                description: true,
              },
              orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
            },
            content: true,
            courseDescriptions: true,
            electiveGroups: { select: { id: true, name: true, chooseUnits: true } },
          },
        });

        const formattedStaff: BulletinStaff[] = dept.staff
          .filter((s) => s.isActive)
          .map((s) => ({
          id: s.id,
          fullName: formatStaffName({
            title: s.title,
            surname: s.surname,
            firstName: s.firstName,
            middleName: s.middleName,
          }),
          title: getTitleDisplay(s.title),
          rank: staffRankLabel(s),
          qualification: s.highestQualification,
          specialization: s.specialization || undefined,
          email: s.email || undefined,
          imageUrl: s.imageUrl || undefined,
          type: s.type,
        }));

        const formattedCourses: BulletinCourse[] = (submission?.courses || []).map((c) =>
          toBulletinCourse(c, { departmentId: dept.id, schoolId: school.id }),
        );

        programmes.push({
          id: prog.id,
          name: prog.name,
          code: prog.code,
          degreeType: prog.degreeType || undefined,
          department: dept.name,
          departmentCode: dept.code,
          school: school.name,
          schoolCode: school.code,
          submissionStatus: submission?.status,
          courses: formattedCourses,
          electiveGroups: submission?.electiveGroups ?? [],
          staff: formattedStaff,
          // E4 and Q4: the Dean and Head from the school and department records.
          leaders: resolveLeaders(school, dept, submission?.content?.programmeInfo),
          content: submission?.content
            ? {
                deanImageUrl: (submission.content.programmeInfo as any)?.deanImageUrl || undefined,
                hodImageUrl: (submission.content.programmeInfo as any)?.hodImageUrl || undefined,
                sectionF: submission.content.sectionF ? { content: (submission.content.sectionF as any).content } : undefined,
                sectionG: submission.content.sectionG ? { content: (submission.content.sectionG as any).content } : undefined,
                philosophy: submission.content.philosophy || undefined,
                mission: submission.content.mission || undefined,
                vision: submission.content.vision || undefined,
                objectives: Array.isArray(submission.content.objectives)
                  ? (submission.content.objectives as string[])
                  : undefined,
                uniqueFeatures: Array.isArray(submission.content.uniqueFeatures)
                  ? (submission.content.uniqueFeatures as string[])
                  : undefined,
                employability: Array.isArray(submission.content.employability)
            ? (submission.content.employability as string[])
            : submission.content.employability
              ? [(submission.content.employability as string)]
              : undefined,
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
