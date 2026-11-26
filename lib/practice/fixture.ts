/**
 * Task U6: what the practice programme starts with. A made-up programme,
 * half drafted, the way a real draft starts: some sections written, the
 * course structure filled in from a bulletin, the General Education block
 * locked. Nothing here is a real programme or a real person.
 */
import { GENERAL_EDUCATION_BLOCK } from "@/lib/courses/general-education";
import { PRACTICE_IDS, PRACTICE_PREFIX } from "@/lib/practice/ids";

export type PracticeCourse = {
  id: string;
  code: string;
  title: string;
  units: number;
  status: "CORE" | "ELECTIVE";
  semester: number | null;
  level: number;
  prerequisites: string | null;
  masterCourseId: string | null;
  isGeneralEducation: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PracticeDescription = {
  id: string;
  courseId: string;
  learningOutcomes: string[];
  courseContent: string | null;
  labWork: string | null;
  entrepreneurialAspect: string | null;
  updatedAt: string;
};

export type PracticePerson = { id: string; firstName: string; lastName: string; role: string };

export type PracticeComment = {
  id: string;
  content: string;
  section: string | null;
  phase: number;
  type: "SUGGESTION" | "ISSUE" | "QUESTION" | "APPROVAL";
  status: "OPEN" | "RESOLVED";
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  submissionId: string;
  authorId: string;
  author: PracticePerson;
};

export type PracticeTransition = {
  id: string;
  fromPhase: number;
  toPhase: number;
  action: string;
  remarks: string | null;
  transitionedAt: string;
  phaseOverride: null;
  submissionId: string;
  performedById: string;
  performedBy: PracticePerson;
};

export type PracticeQuestion = {
  id: string;
  section: string;
  field: string | null;
  question: string;
  askedAt: string;
  dueAt: string;
};

/** A staff row with the real Staff columns (the staff table reads these). */
export type PracticeStaff = {
  id: string;
  title: string;
  gender: "MALE" | "FEMALE";
  surname: string;
  middleName: string | null;
  firstName: string;
  highestQualification: string;
  academicRank: string;
  customJobTitle: string | null;
  specialization: string | null;
  email: string | null;
  imageUrl: string | null;
  imageDriveFileId: string | null;
  type: "ACADEMIC" | "ADJUNCT" | "NON_ACADEMIC";
  isActive: boolean;
  departmentId: string;
  createdAt: string;
  updatedAt: string;
};

export type PracticeState = {
  version: 1;
  startedAt: string;
  submission: {
    id: string;
    title: string;
    currentPhase: number;
    status: "DRAFT" | "CORRECTIONS_REQUIRED" | "IN_REVIEW" | "APPROVED" | "REJECTED";
    submittedAt: string | null;
    approvedAt: string | null;
    openedByDeanAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  content: Record<string, unknown>;
  courses: PracticeCourse[];
  descriptions: PracticeDescription[];
  comments: PracticeComment[];
  transitions: PracticeTransition[];
  questions: PracticeQuestion[];
  staff: PracticeStaff[];
  courseList: {
    confirmedAt: string | null;
    /** The course list as it was when confirmed, to tell whether it changed since. */
    confirmedFingerprint: string | null;
    requests: { id: string; kind: string; courseCode: string | null; details: string; status: string; response: string | null; requestedAt: string; requestedBy: string | null; resolvedAt: string | null; resolvedBy: string | null }[];
  };
  nextId: number;
};

export const PRACTICE_PROGRAMME = {
  id: PRACTICE_IDS.programme,
  name: "B.Sc. (Hons.) Practice Studies",
  code: "PRACTICE",
  duration: 4,
  department: {
    id: PRACTICE_IDS.department,
    name: "Department of Practice Studies",
    code: "PRAC",
    school: { id: PRACTICE_IDS.school, name: "School of Practice", code: "PRAC" },
  },
};

/** People made up, for the history the practice starts with. */
export const PRACTICE_HEAD: PracticePerson = { id: `${PRACTICE_PREFIX}head`, firstName: "Sample", lastName: "Head", role: "HOD" };
export const PRACTICE_DEAN: PracticePerson = { id: `${PRACTICE_PREFIX}dean`, firstName: "Sample", lastName: "Dean", role: "DEAN" };

/** Where each role's practice starts: at the desk where they work. */
export function startingPhaseFor(role: string): number {
  if (role === "DEAN") return 2;
  if (role === "ADMIN" || role === "SUPER_ADMIN") return 3;
  return 1;
}

const OWN_COURSES: Array<Omit<PracticeCourse, "id" | "createdAt" | "updatedAt" | "isGeneralEducation" | "masterCourseId" | "prerequisites">> = [
  { code: "PRS 101", title: "Introduction to Practice Studies", units: 3, status: "CORE", semester: 1, level: 100 },
  { code: "PRS 102", title: "Foundations of Field Practice", units: 3, status: "CORE", semester: 2, level: 100 },
  { code: "PRS 201", title: "Methods in Practice Studies", units: 3, status: "CORE", semester: 1, level: 200 },
  { code: "PRS 204", title: "Practice and Society", units: 2, status: "ELECTIVE", semester: 2, level: 200 },
  { code: "PRS 301", title: "Applied Practice I", units: 3, status: "CORE", semester: 1, level: 300 },
  { code: "PRS 302", title: "Applied Practice II", units: 3, status: "CORE", semester: 2, level: 300 },
  { code: "PRS 399", title: "Industrial Training (SIWES)", units: 6, status: "CORE", semester: 2, level: 300 },
  { code: "PRS 401", title: "Advanced Topics in Practice", units: 3, status: "CORE", semester: 1, level: 400 },
  { code: "PRS 490", title: "Research Project", units: 6, status: "CORE", semester: null, level: 400 },
];

/** The practice programme as it starts, for someone with this role. */
export function startingPracticeState(role: string = "HOD", now: Date = new Date()): PracticeState {
  const at = now.toISOString();
  let next = 1;
  const id = (kind: string) => `${PRACTICE_PREFIX}${kind}-${next++}`;
  const general = GENERAL_EDUCATION_BLOCK.filter((course) => course.level <= PRACTICE_PROGRAMME.duration * 100).map(
    (course): PracticeCourse => ({
      id: id("course"),
      code: course.code,
      title: course.title,
      units: course.units,
      status: "CORE",
      semester: course.semester,
      level: course.level,
      prerequisites: null,
      masterCourseId: null,
      isGeneralEducation: true,
      createdAt: at,
      updatedAt: at,
    }),
  );
  const own = OWN_COURSES.map(
    (course): PracticeCourse => ({ ...course, id: id("course"), prerequisites: null, masterCourseId: null, isGeneralEducation: false, createdAt: at, updatedAt: at }),
  );
  const first = own[0];
  const phase = startingPhaseFor(role);
  // A Dean or DAP starts with the programme already sent to them.
  const transitions: PracticeTransition[] = [];
  for (let from = 1; from < phase; from += 1) {
    const by = from === 1 ? PRACTICE_HEAD : PRACTICE_DEAN;
    transitions.unshift({
      id: id("transition"),
      fromPhase: from,
      toPhase: from + 1,
      action: from === 1 ? "SUBMIT" : "APPROVE",
      remarks: null,
      transitionedAt: at,
      phaseOverride: null,
      submissionId: PRACTICE_IDS.draft,
      performedById: by.id,
      performedBy: by,
    });
  }
  return {
    version: 1,
    startedAt: at,
    submission: {
      id: PRACTICE_IDS.draft,
      title: "Practice Studies: practice draft",
      currentPhase: phase,
      status: phase === 1 ? "DRAFT" : "IN_REVIEW",
      submittedAt: phase === 1 ? null : at,
      approvedAt: null,
      openedByDeanAt: null,
      createdAt: at,
      updatedAt: at,
    },
    content: {
      vision: "To be a department known for practice that serves people well.",
      mission: "",
      philosophy:
        "The programme is built on the belief that students learn a discipline best by practising it, with guidance, from their first year.",
      objectives: [
        "Give students a sound grounding in the theory of practice studies.",
        "Prepare graduates for work through supervised field practice.",
      ],
      uniqueFeatures: [],
      centurySkills: [],
      employability: "",
      utmeRequirements: "",
      directEntryRequirements: "",
      transferRequirements: "",
      graduationRequirements: "",
      minimumCGPA: 2,
    },
    courses: [...general, ...own],
    descriptions: [
      {
        id: id("description"),
        courseId: first.id,
        learningOutcomes: [
          "Describe the main ideas of practice studies.",
          "Explain how practice studies relates to other disciplines.",
        ],
        courseContent: "Meaning and scope of practice studies. History of the field. Main schools of thought.",
        labWork: null,
        entrepreneurialAspect: null,
        updatedAt: at,
      },
    ],
    comments: [],
    transitions,
    questions: [],
    staff: [
      {
        id: id("staff"),
        title: "DR",
        gender: "FEMALE",
        surname: "Lecturer",
        middleName: null,
        firstName: "Sample",
        highestQualification: "PHD",
        academicRank: "SENIOR_LECTURER",
        customJobTitle: null,
        specialization: "Field practice",
        email: null,
        imageUrl: null,
        imageDriveFileId: null,
        type: "ACADEMIC",
        isActive: true,
        departmentId: PRACTICE_IDS.department,
        createdAt: at,
        updatedAt: at,
      },
    ],
    courseList: { confirmedAt: null, confirmedFingerprint: null, requests: [] },
    nextId: next,
  };
}
