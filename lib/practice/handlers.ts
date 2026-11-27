/**
 * Task U6: the practice programme's endpoints, answered in the browser from
 * the practice state. Each answer has the shape the real route returns, so
 * the real draft screen works unchanged. The rules are the real ones where
 * they are pure (workflow, General Education lock, units and semesters);
 * what would reach other people (Ask DAP, the Dean, emails) is shown as it
 * would happen and goes nowhere.
 */
import type { SubmissionStatus, UserRole } from "@prisma/client";
import { DEFAULT_PHASE_OWNERS, canEditSubmissionAtStage, getWorkflowAccess, resolveWorkflowTransition } from "@/lib/submissions/workflow";
import { GENERAL_EDUCATION_LOCKED_MESSAGE } from "@/lib/courses/general-education";
import { calculateSubmissionProgress } from "@/lib/submissions/progress";
import { runRules } from "@/lib/checks/rules";
import { creditSummary, graduationNumbersText } from "@/lib/courses/credit-summary";
import { formatStaffName, getTitleDisplay, staffRankLabel } from "@/lib/validation/name-format";
import { PRACTICE_IDS, PRACTICE_PREFIX, isPracticeId } from "@/lib/practice/ids";
import {
  PRACTICE_PROGRAMME,
  type PracticeComment,
  type PracticeCourse,
  type PracticeDescription,
  type PracticePerson,
  type PracticeStaff,
  type PracticeState,
} from "@/lib/practice/fixture";

export type PracticeViewer = { id: string; role: string; firstName: string; lastName: string };

export type PracticeRequest = { method: string; url: URL; body: string | null; hasFile: boolean };

export type PracticeResult = {
  state: PracticeState;
  changed: boolean;
  status: number;
  body: unknown;
  /** A read the real server can answer once the practice ids are taken out. */
  forward?: string;
};

/** What an action that would reach someone else says in the practice. */
export const PRACTICE_NOT_SENT = "Practice: nothing was sent. On your real programme this reaches the person shown, after the checks that every section is complete.";

const NOT_HERE = "That isn't part of the practice programme, so nothing was changed. Try it on your real programme when you're ready.";

function parse(body: string | null): Record<string, unknown> {
  if (!body) return {};
  try {
    const value = JSON.parse(body) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clone(state: PracticeState): PracticeState {
  return structuredClone(state);
}

function nextId(state: PracticeState, kind: string): string {
  const id = `${PRACTICE_PREFIX}${kind}-${state.nextId}`;
  state.nextId += 1;
  return id;
}

function person(viewer: PracticeViewer): PracticePerson {
  return { id: viewer.id, firstName: viewer.firstName || "You", lastName: viewer.lastName, role: viewer.role };
}

const ok = (state: PracticeState, body: unknown, status = 200): PracticeResult => ({ state, changed: false, status, body });
const saved = (state: PracticeState, body: unknown, status = 200): PracticeResult => ({ state, changed: true, status, body });
const refuse = (state: PracticeState, status: number, error: string, extra: Record<string, unknown> = {}): PracticeResult => ({
  state,
  changed: false,
  status,
  body: { error, ...extra },
});

// ── The draft ──

/** The real rule: the phase's owner edits a draft or a revision. */
function canEdit(state: PracticeState, viewer: PracticeViewer): boolean {
  return canEditSubmissionAtStage({
    role: viewer.role as UserRole,
    userId: viewer.id,
    currentPhase: state.submission.currentPhase,
    currentStatus: state.submission.status as SubmissionStatus,
    owners: DEFAULT_PHASE_OWNERS,
  });
}

function workflowActions(state: PracticeState, viewer: PracticeViewer) {
  return getWorkflowAccess({
    role: viewer.role as UserRole,
    userId: viewer.id,
    currentPhase: state.submission.currentPhase,
    currentStatus: state.submission.status as SubmissionStatus,
    owners: DEFAULT_PHASE_OWNERS,
  }).actions;
}

export function practiceSubmission(state: PracticeState, viewer: PracticeViewer) {
  return {
    ...state.submission,
    programmeId: PRACTICE_IDS.programme,
    cycleId: PRACTICE_IDS.cycle,
    createdById: viewer.id,
    dismissedRegistryCourseIds: [],
    cycle: { name: "Practice", isTest: true, archivedAt: null },
    programme: PRACTICE_PROGRAMME,
    createdBy: { id: viewer.id, firstName: viewer.firstName, lastName: viewer.lastName, email: "", role: viewer.role },
    content: { id: `${PRACTICE_PREFIX}content`, submissionId: PRACTICE_IDS.draft, ...state.content },
    comments: [...state.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    phaseTransitions: state.transitions,
    workflow: {
      actions: workflowActions(state, viewer),
      clearedPreviousGate: false,
      requiredEvidence: null,
      graceGate: null,
      submitClosed: null,
      override: null,
      canEdit: canEdit(state, viewer),
    },
  };
}

function saveContent(state: PracticeState, viewer: PracticeViewer, body: Record<string, unknown>): PracticeResult {
  if (body.status !== undefined) {
    return refuse(state, 400, "The submission status can only be changed through the workflow actions.");
  }
  if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
  const next = clone(state);
  const content = body.content && typeof body.content === "object" ? (body.content as Record<string, unknown>) : {};
  const cgpa = content.minimumCGPA;
  if (cgpa !== undefined && cgpa !== null && cgpa !== "" && !(Number(cgpa) >= 2 && Number(cgpa) <= 5)) {
    return refuse(state, 400, "The minimum CGPA must be between 2.00 and 5.00.", { code: "CGPA_OUT_OF_RANGE" });
  }
  // The real server ignores the philosophy GRACE result sent back with the page.
  delete content.philosophyGrace;
  delete content.philosophyGracePass;
  next.content = { ...next.content, ...content };
  if (typeof body.title === "string") next.submission.title = body.title;
  next.submission.updatedAt = new Date().toISOString();
  return saved(next, practiceSubmission(next, viewer));
}

function transition(state: PracticeState, viewer: PracticeViewer, body: Record<string, unknown>): PracticeResult {
  const action = String(body.action ?? "");
  const remarks = typeof body.remarks === "string" ? body.remarks : null;
  if (!workflowActions(state, viewer).includes(action as never)) {
    return refuse(state, 403, "That action isn't open to you at this phase.");
  }
  const move = resolveWorkflowTransition({
    action,
    currentPhase: state.submission.currentPhase,
    currentStatus: state.submission.status as SubmissionStatus,
    remarks,
  });
  if (!move.ok) return refuse(state, move.statusCode, move.message);
  const next = clone(state);
  const at = new Date().toISOString();
  next.transitions.unshift({
    id: nextId(next, "transition"),
    fromPhase: state.submission.currentPhase,
    toPhase: move.phase,
    action,
    remarks,
    transitionedAt: at,
    phaseOverride: null,
    submissionId: PRACTICE_IDS.draft,
    performedById: viewer.id,
    performedBy: person(viewer),
  });
  next.submission.currentPhase = move.phase;
  next.submission.status = move.status as PracticeState["submission"]["status"];
  if (action === "SUBMIT") next.submission.submittedAt = at;
  if (move.status === "APPROVED") next.submission.approvedAt = at;
  next.submission.updatedAt = at;
  return saved(next, { ...practiceSubmission(next, viewer), practiceNote: PRACTICE_NOT_SENT });
}

function addComment(state: PracticeState, viewer: PracticeViewer, body: Record<string, unknown>): PracticeResult {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return refuse(state, 400, "Write the comment first.");
  const next = clone(state);
  const at = new Date().toISOString();
  const comment: PracticeComment = {
    id: nextId(next, "comment"),
    content,
    section: typeof body.section === "string" ? body.section : null,
    phase: next.submission.currentPhase,
    type: (["SUGGESTION", "ISSUE", "QUESTION", "APPROVAL"].includes(String(body.type)) ? body.type : "SUGGESTION") as PracticeComment["type"],
    status: "OPEN",
    resolvedAt: null,
    createdAt: at,
    updatedAt: at,
    submissionId: PRACTICE_IDS.draft,
    authorId: viewer.id,
    author: person(viewer),
  };
  next.comments.push(comment);
  return saved(next, comment, 201);
}

function updateComment(state: PracticeState, commentId: string, body: Record<string, unknown>, remove: boolean): PracticeResult {
  const next = clone(state);
  const index = next.comments.findIndex((comment) => comment.id === commentId);
  if (index < 0) return refuse(state, 404, "Comment not found");
  if (remove) {
    next.comments.splice(index, 1);
    return saved(next, { success: true });
  }
  const comment = next.comments[index];
  if (body.status === "OPEN" || body.status === "RESOLVED") {
    comment.status = body.status;
    comment.resolvedAt = body.status === "RESOLVED" ? new Date().toISOString() : null;
  }
  if (typeof body.content === "string" && body.content.trim()) comment.content = body.content.trim();
  comment.updatedAt = new Date().toISOString();
  return saved(next, comment);
}

// ── Courses ──

function courseOut(state: PracticeState, course: PracticeCourse) {
  const description = state.descriptions.find((item) => item.courseId === course.id) ?? null;
  return {
    ...course,
    submissionId: PRACTICE_IDS.draft,
    masterCourse: null,
    isMandatory: course.isGeneralEducation,
    descriptionAccess: "LOCAL",
    sharedOwner: null,
    sharedWithProgrammes: 0,
    description: description ? descriptionOut(description) : null,
  };
}

function descriptionOut(description: PracticeDescription) {
  return {
    ...description,
    submissionId: PRACTICE_IDS.draft,
    gracePass: false,
    graceResult: null,
    graceStatus: "PENDING",
    graceContentHash: null,
    graceCheckedAt: null,
    createdAt: description.updatedAt,
  };
}

function listCourses(state: PracticeState, level: string | null) {
  return state.courses
    .filter((course) => !level || course.level === Number(level))
    .sort((a, b) => a.level - b.level || (a.semester ?? 3) - (b.semester ?? 3) || a.code.localeCompare(b.code))
    .map((course) => courseOut(state, course));
}

const CODE_PATTERN = /^(BU-)?[A-Z]{2,4} \d{3}$/;

function formatCode(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const match = text.match(/^(BU-)?([A-Z]{2,4})\s?(\d{3})$/);
  return match ? `${match[1] ?? ""}${match[2]} ${match[3]}` : text;
}

function semesterOf(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "" || value === "S") return null;
  const number = Number(value);
  return number === 1 || number === 2 ? number : undefined;
}

function validUnits(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 12;
}

function newCourse(next: PracticeState, row: Record<string, unknown>): PracticeCourse | string {
  const code = formatCode(row.code);
  const title = String(row.title ?? "").trim();
  const units = Number(row.units);
  const level = Number(row.level);
  const semester = semesterOf(row.semester);
  if (!CODE_PATTERN.test(code)) return "Invalid course code. Use a format such as COS 101, or BU-COS 101 for a Babcock-specific course.";
  if (!title) return "submissionId, code, title, units and level are required";
  if (!validUnits(units)) return "Units must be a whole number from 0 to 12.";
  if (![100, 200, 300, 400, 500, 600].includes(level)) return "Invalid level. Must be 100, 200, 300, 400, 500, or 600";
  if (semester === undefined) return "Semester must be 1, 2, or empty for a sessional course.";
  if (next.courses.some((course) => course.code === code)) return "A course with this code already exists in this submission";
  if (next.courses.some((course) => course.title.toLowerCase() === title.toLowerCase())) return "A course with this title already exists in this submission";
  const at = new Date().toISOString();
  return {
    id: nextId(next, "course"),
    code,
    title,
    units,
    status: row.status === "ELECTIVE" ? "ELECTIVE" : "CORE",
    semester,
    level,
    prerequisites: typeof row.prerequisites === "string" && row.prerequisites ? row.prerequisites : null,
    masterCourseId: null,
    isGeneralEducation: false,
    createdAt: at,
    updatedAt: at,
  };
}

function addCourse(state: PracticeState, viewer: PracticeViewer, body: Record<string, unknown>): PracticeResult {
  if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
  const next = clone(state);
  const course = newCourse(next, body);
  if (typeof course === "string") return refuse(state, course.includes("already exists") ? 409 : 400, course);
  next.courses.push(course);
  return saved(next, { ...courseOut(next, course), optionsNote: null }, 201);
}

function changeCourse(state: PracticeState, viewer: PracticeViewer, courseId: string, body: Record<string, unknown>): PracticeResult {
  if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
  const next = clone(state);
  const course = next.courses.find((item) => item.id === courseId);
  if (!course) return refuse(state, 404, "Course not found");
  if (course.isGeneralEducation) {
    const changes = (["code", "title", "units", "status", "level"] as const).filter(
      (key) => body[key] !== undefined && (key === "code" ? formatCode(body[key]) : body[key]) !== course[key],
    );
    if (changes.length || (body.semester !== undefined && semesterOf(body.semester) !== course.semester)) {
      return refuse(state, 403, GENERAL_EDUCATION_LOCKED_MESSAGE, { code: "GENERAL_EDUCATION_LOCKED" });
    }
    return ok(state, courseOut(state, course));
  }
  if (body.code !== undefined) {
    const code = formatCode(body.code);
    if (!CODE_PATTERN.test(code)) return refuse(state, 400, "Invalid course code. Use a format such as COS 101, or BU-COS 101 for a Babcock-specific course.");
    if (next.courses.some((item) => item.id !== courseId && item.code === code)) return refuse(state, 409, "A course with this code already exists in this submission");
    course.code = code;
  }
  if (typeof body.title === "string" && body.title.trim()) course.title = body.title.trim();
  if (body.units !== undefined) {
    if (!validUnits(body.units)) return refuse(state, 400, "Units must be a whole number from 0 to 12.");
    course.units = body.units as number;
  }
  if (body.status === "CORE" || body.status === "ELECTIVE") course.status = body.status;
  if (body.semester !== undefined) {
    const semester = semesterOf(body.semester);
    if (semester === undefined) return refuse(state, 400, "Semester must be 1, 2, or empty for a sessional course.");
    course.semester = semester;
  }
  if (body.level !== undefined) course.level = Number(body.level);
  if (body.prerequisites !== undefined) course.prerequisites = (body.prerequisites as string) || null;
  course.updatedAt = new Date().toISOString();
  return saved(next, { ...courseOut(next, course), optionsNote: null });
}

function removeCourses(state: PracticeState, viewer: PracticeViewer, ids: string[]): PracticeResult {
  if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
  const rows = state.courses.filter((course) => ids.includes(course.id));
  if (rows.length === 0) return refuse(state, 404, "Course not found");
  if (rows.some((course) => course.isGeneralEducation)) {
    return refuse(state, 403, GENERAL_EDUCATION_LOCKED_MESSAGE, { code: "GENERAL_EDUCATION_LOCKED" });
  }
  const next = clone(state);
  next.courses = next.courses.filter((course) => !ids.includes(course.id));
  next.descriptions = next.descriptions.filter((description) => !ids.includes(description.courseId));
  return saved(next, { success: true, deleted: rows.length, optionsNote: null });
}

function importCourses(state: PracticeState, viewer: PracticeViewer, rows: unknown[]): PracticeResult {
  if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
  const next = clone(state);
  const issues: { row: number; errors: string[] }[] = [];
  rows.forEach((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const course = newCourse(next, {
      code: row["Course Code"] ?? row.code,
      title: row["Course Title"] ?? row.title,
      units: Number(row.Units ?? row.units),
      level: Number(row.Level ?? row.level),
      semester: row.Semester ?? row.semester,
      status: String(row.Status ?? row.status ?? "CORE").toUpperCase().startsWith("E") ? "ELECTIVE" : "CORE",
    });
    if (typeof course === "string") issues.push({ row: index + 2, errors: [course] });
    else next.courses.push(course);
  });
  if (issues.length) return refuse(state, 400, "The import contains invalid or duplicate course rows.", { issues });
  return saved(next, { imported: rows.length, graceQueued: 0, optionsNote: null }, 201);
}

function saveDescription(state: PracticeState, viewer: PracticeViewer, courseId: string, body: Record<string, unknown>): PracticeResult {
  if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return refuse(state, 404, "Course not found");
  if (course.isGeneralEducation) return refuse(state, 403, GENERAL_EDUCATION_LOCKED_MESSAGE, { code: "GENERAL_EDUCATION_LOCKED" });
  const next = clone(state);
  const at = new Date().toISOString();
  let description = next.descriptions.find((item) => item.courseId === courseId);
  if (!description) {
    description = { id: nextId(next, "description"), courseId, learningOutcomes: [], courseContent: null, labWork: null, entrepreneurialAspect: null, updatedAt: at };
    next.descriptions.push(description);
  }
  if (Array.isArray(body.learningOutcomes)) description.learningOutcomes = body.learningOutcomes.map(String);
  if (body.courseContent !== undefined) description.courseContent = (body.courseContent as string) || null;
  if (body.labWork !== undefined) description.labWork = (body.labWork as string) || null;
  if (body.entrepreneurialAspect !== undefined) description.entrepreneurialAspect = (body.entrepreneurialAspect as string) || null;
  description.updatedAt = at;
  return saved(next, { ...descriptionOut(description), course: { id: course.id, code: course.code, title: course.title }, sharedWith: [] });
}

// ── Staff ──

const STAFF_FIELDS = [
  "title",
  "gender",
  "surname",
  "middleName",
  "firstName",
  "highestQualification",
  "academicRank",
  "customJobTitle",
  "specialization",
  "email",
  "type",
] as const;

function staffOut(member: PracticeStaff) {
  return {
    ...member,
    department: { id: PRACTICE_PROGRAMME.department.id, name: PRACTICE_PROGRAMME.department.name, code: PRACTICE_PROGRAMME.department.code },
    fullName: formatStaffName(member),
  };
}

function saveStaff(state: PracticeState, viewer: PracticeViewer, staffId: string | null, body: Record<string, unknown>, remove = false): PracticeResult {
  if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
  const next = clone(state);
  if (remove) {
    if (!next.staff.some((member) => member.id === staffId)) return refuse(state, 404, "Staff member not found");
    next.staff = next.staff.filter((member) => member.id !== staffId);
    return saved(next, { success: true, archived: true });
  }
  const fields: Record<string, unknown> = {};
  for (const key of STAFF_FIELDS) {
    if (body[key] === undefined) continue;
    fields[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : body[key];
  }
  const at = new Date().toISOString();
  if (staffId) {
    const member = next.staff.find((item) => item.id === staffId);
    if (!member) return refuse(state, 404, "Staff member not found");
    Object.assign(member, fields, { updatedAt: at });
    if (!member.firstName || !member.surname) return refuse(state, 400, "First name and surname are required.");
    return saved(next, staffOut(member));
  }
  const member: PracticeStaff = {
    id: nextId(next, "staff"),
    title: "MR",
    gender: "MALE",
    surname: "",
    middleName: null,
    firstName: "",
    highestQualification: "BACHELOR",
    academicRank: "LECTURER_I",
    customJobTitle: null,
    specialization: null,
    email: null,
    imageUrl: null,
    imageDriveFileId: null,
    type: "ACADEMIC",
    isActive: true,
    departmentId: PRACTICE_IDS.department,
    createdAt: at,
    updatedAt: at,
    ...(fields as Partial<PracticeStaff>),
  };
  if (!member.firstName || !member.surname) return refuse(state, 400, "First name and surname are required.");
  next.staff.push(member);
  return saved(next, staffOut(member), 201);
}

// ── Section marks, Ask DAP and the course list ──

const SECTION_KEYS = ["deans_hods", "staff", "overview", "admission", "graduation", "courses", "descriptions", "regulations"];

function courseFingerprint(state: PracticeState): string {
  return state.courses
    .map((course) => `${course.code}|${course.units}|${course.semester ?? "S"}|${course.level}|${course.status}`)
    .sort()
    .join("\n");
}

/** The section marks, worked out with the real progress rules. */
function practiceSections(state: PracticeState) {
  const confirmed = Boolean(state.courseList.confirmedAt) && state.courseList.confirmedFingerprint === courseFingerprint(state);
  const progress = calculateSubmissionProgress({
    content: state.content as Parameters<typeof calculateSubmissionProgress>[0]["content"],
    activeStaffCount: state.staff.length,
    courses: state.courses.map((course) => {
      const description = state.descriptions.find((item) => item.courseId === course.id);
      return {
        isGeneralEducation: course.isGeneralEducation,
        description: description ? { courseContent: description.courseContent, learningOutcomes: description.learningOutcomes, graceStatus: "PENDING" } : null,
      };
    }),
    courseListConfirmed: confirmed,
  });
  const marks: Record<string, { state: "done" | "check" | "fix" | "none"; count: number; label: string }> = {};
  for (const section of progress.sections) {
    const comments = state.comments.filter((comment) => comment.status === "OPEN" && comment.section === section.key).length;
    if (comments > 0) marks[section.key] = { state: "fix", count: comments, label: `${comments} to fix: ${comments} open comment${comments === 1 ? "" : "s"}` };
    else if (section.complete) marks[section.key] = { state: "done", count: 0, label: "Complete" };
    else if (section.percentage > 0 || section.hint) {
      marks[section.key] = { state: "check", count: 0, label: section.hint ? `Needs checking: ${section.hint}` : `Needs checking: ${section.percentage}% done` };
    } else marks[section.key] = { state: "none", count: 0, label: "Not started" };
  }
  return { percentage: progress.percentage, marks };
}

function questionView(question: PracticeState["questions"][number], viewer: PracticeViewer) {
  return {
    ...question,
    submissionId: PRACTICE_IDS.draft,
    sectionTitle: question.section,
    status: "OPEN",
    answer: null,
    overdue: false,
    answeredAt: null,
    askedBy: [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") || null,
    officerId: null,
    officer: "your school's DAP officer (not sent: this is the practice programme)",
    answeredBy: null,
    programme: PRACTICE_PROGRAMME.name,
    department: PRACTICE_PROGRAMME.department.name,
    school: PRACTICE_PROGRAMME.department.school.name,
  };
}

function courseListState(state: PracticeState, viewer: PracticeViewer) {
  const { confirmedAt, confirmedFingerprint, requests } = state.courseList;
  return {
    confirmation: confirmedAt
      ? {
          confirmedAt,
          confirmedBy: [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") || null,
          courseCount: state.courses.length,
          changedSince: confirmedFingerprint !== courseFingerprint(state),
        }
      : null,
    requests,
  };
}

// ── Preview ──

/** The bulletin preview of the practice programme, as the server builds a real one. */
function practicePreview(state: PracticeState) {
  const content = state.content as Record<string, unknown>;
  const employability = content.employability;
  return {
    level: "department",
    title: `${PRACTICE_PROGRAMME.name}: practice preview`,
    generatedAt: new Date().toISOString(),
    university: null,
    summary: { totalProgrammes: 1, totalCourses: state.courses.length, totalStaff: state.staff.length },
    programmes: [
      {
        id: PRACTICE_PROGRAMME.id,
        name: PRACTICE_PROGRAMME.name,
        code: PRACTICE_PROGRAMME.code,
        degreeType: "B.Sc.",
        department: PRACTICE_PROGRAMME.department.name,
        departmentCode: PRACTICE_PROGRAMME.department.code,
        school: PRACTICE_PROGRAMME.department.school.name,
        schoolCode: PRACTICE_PROGRAMME.department.school.code,
        submissionStatus: state.submission.status,
        courses: [...state.courses]
          .sort((a, b) => a.level - b.level || (a.semester ?? 3) - (b.semester ?? 3) || a.code.localeCompare(b.code))
          .map((course) => {
            const description = state.descriptions.find((item) => item.courseId === course.id);
            return {
              code: course.code,
              title: course.title,
              units: course.units,
              status: course.status,
              semester: course.semester,
              level: course.level,
              prerequisites: course.prerequisites ?? undefined,
              description: description
                ? {
                    learningOutcomes: description.learningOutcomes,
                    courseContent: description.courseContent ?? undefined,
                    labWork: description.labWork ?? undefined,
                    entrepreneurialAspect: description.entrepreneurialAspect ?? undefined,
                  }
                : undefined,
            };
          }),
        staff: state.staff.map((member) => ({
          id: member.id,
          fullName: formatStaffName(member),
          title: getTitleDisplay(member.title),
          rank: staffRankLabel(member),
          qualification: member.highestQualification,
          specialization: member.specialization ?? undefined,
          type: member.type,
        })),
        content: {
          ...content,
          employability: Array.isArray(employability) ? employability : employability ? [String(employability)] : [],
        },
      },
    ],
  };
}

// ── Checks (F1, F2) and the credit numbers (W4, W5) ──

function practiceCourses(state: PracticeState) {
  return state.courses.map((course) => {
    const description = state.descriptions.find((item) => item.courseId === course.id);
    return {
      code: course.code,
      title: course.title,
      units: course.units,
      level: course.level,
      semester: course.semester,
      status: course.status,
      // The practice courses come from the Registry and the General Education block.
      inRegistry: true,
      generalEducation: course.isGeneralEducation,
      owned: true,
      description: description
        ? { learningOutcomes: description.learningOutcomes.filter((item) => item.trim()), courseContent: description.courseContent ?? "" }
        : null,
    };
  });
}

/** The same checks as a real programme; GRACE (V12) runs on real programmes only. */
function practiceChecks(state: PracticeState) {
  const confirmed = Boolean(state.courseList.confirmedAt) && state.courseList.confirmedFingerprint === courseFingerprint(state);
  const results = runRules({
    submissionId: PRACTICE_IDS.draft,
    phase: state.submission.currentPhase,
    programme: { code: PRACTICE_PROGRAMME.code, name: PRACTICE_PROGRAMME.name, duration: PRACTICE_PROGRAMME.duration, isNew: false },
    content: state.content,
    courses: practiceCourses(state),
    staff: state.staff
      .filter((member) => member.isActive)
      .map((member) => ({
        type: member.type,
        academicRank: member.academicRank,
        highestQualification: member.highestQualification || null,
        customJobTitle: member.customJobTitle,
        name: `${member.firstName} ${member.surname}`.trim(),
      })),
    openComments: state.comments.filter((comment) => comment.status === "OPEN").map((comment) => ({ section: comment.section })),
    courseListConfirmed: confirmed,
    graceBlocked: [],
  }).map((finding) => ({ ...finding, accepted: null }));
  const mustFix = results.filter((result) => result.level === "MUST").length;
  const pleaseCheck = results.filter((result) => result.level === "CHECK").length;
  return { ready: mustFix === 0, counts: { mustFix, pleaseCheck, accepted: 0 }, open: mustFix + pleaseCheck, results };
}

function practiceCredits(state: PracticeState) {
  const summary = creditSummary(practiceCourses(state));
  const stated = typeof state.content.totalUnits === "number" ? state.content.totalUnits : null;
  return { ...summary, statedTotal: stated, graduationText: summary.totals.total > 0 ? graduationNumbersText(summary.totals) : null };
}

// ── Router ──

export function handlePracticeRequest(state: PracticeState, viewer: PracticeViewer, request: PracticeRequest): PracticeResult {
  const { method } = request;
  const path = request.url.pathname.replace(/\/+$/, "");
  const query = request.url.searchParams;
  const body = parse(request.body);
  const parts = path.split("/").filter(Boolean); // ["api", ...]
  const [, area, id, sub, subId] = parts;

  if (request.hasFile) return refuse(state, 400, "Photos and files aren't kept in the practice programme. Upload them on your real programme.");

  if (area === "submissions" && id === PRACTICE_IDS.draft) {
    if (!sub) {
      if (method === "GET") return ok(state, practiceSubmission(state, viewer));
      if (method === "PUT" || method === "PATCH") return saveContent(state, viewer, body);
    }
    if (sub === "transition" && method === "POST") return transition(state, viewer, body);
    if (sub === "comments") {
      if (method === "GET") return ok(state, state.comments);
      if (method === "POST") return addComment(state, viewer, body);
      if (subId && (method === "PATCH" || method === "PUT")) return updateComment(state, subId, body, false);
      if (subId && method === "DELETE") return updateComment(state, subId, body, true);
    }
    if (sub === "options" && method === "GET") return ok(state, { family: null });
    if (sub === "sections" && method === "GET") return ok(state, practiceSections(state));
    if (sub === "checks") {
      if (method === "GET") return ok(state, practiceChecks(state));
      return refuse(state, 409, "Accepting a check with a reason is kept on your real programme, not in the practice one.", { code: "PRACTICE" });
    }
    if (sub === "credit-summary" && method === "GET") return ok(state, practiceCredits(state));
    if (sub === "elective-groups") {
      if (method === "GET") return ok(state, { groups: [] });
      return refuse(state, 409, "Elective groups are made on your real programme, not in the practice one.", { code: "PRACTICE" });
    }
    if (sub === "questions") {
      if (method === "GET") return ok(state, state.questions.map((question) => questionView(question, viewer)));
      if (method === "POST") {
        const question = typeof body.question === "string" ? body.question.trim() : "";
        const section = String(body.section ?? "");
        if (!SECTION_KEYS.includes(section)) return refuse(state, 400, "Choose the section your question is about.");
        if (question.length < 10 || question.length > 2000) return refuse(state, 400, "Write your question in 10 to 2,000 characters.");
        const next = clone(state);
        const at = new Date();
        next.questions.unshift({
          id: nextId(next, "question"),
          section,
          field: typeof body.field === "string" ? body.field : null,
          question,
          askedAt: at.toISOString(),
          dueAt: new Date(at.getTime() + 24 * 3600 * 1000).toISOString(),
        });
        return saved(next, { ...questionView(next.questions[0], viewer), practiceNote: PRACTICE_NOT_SENT }, 201);
      }
    }
    if (sub === "course-list") {
      if (!subId && method === "GET") return ok(state, courseListState(state, viewer));
      if (!subId && method === "POST") {
        if (!["HOD", "SUPER_ADMIN"].includes(viewer.role)) return refuse(state, 403, "Only the Head of Department confirms the course list.");
        if (!canEdit(state, viewer)) return refuse(state, 403, "You cannot edit this submission");
        const next = clone(state);
        next.courseList.confirmedAt = new Date().toISOString();
        next.courseList.confirmedFingerprint = courseFingerprint(next);
        return saved(next, courseListState(next, viewer));
      }
      if (subId === "requests" && method === "POST") {
        const details = String(body.details ?? "").trim();
        const kind = ["ADD", "REMOVE", "UNITS", "SEMESTER", "OTHER"].includes(String(body.kind)) ? String(body.kind) : "OTHER";
        const courseCode = String(body.courseCode ?? "").trim().toUpperCase().replace(/\s+/g, " ") || null;
        if (details.length < 10 || details.length > 1000) return refuse(state, 400, "Say what should change in 10 to 1,000 characters.");
        if (!courseCode && kind !== "ADD" && kind !== "OTHER") return refuse(state, 400, "Give the course code.");
        const next = clone(state);
        const request = {
          id: nextId(next, "request"),
          kind,
          courseCode,
          details,
          status: "OPEN",
          response: null,
          requestedAt: new Date().toISOString(),
          requestedBy: [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") || null,
          resolvedAt: null,
          resolvedBy: null,
        };
        next.courseList.requests.unshift(request);
        return saved(next, { ...request, practiceNote: PRACTICE_NOT_SENT }, 201);
      }
    }
    if (sub === "importable-courses" && method === "GET") return ok(state, []);
  }

  // The Course Registry is real and read-only here: search it without the
  // practice ids. The whole-registry summary isn't needed in the practice.
  if (area === "master-courses" && !id && method === "GET") {
    if (query.get("fields") === "summary") return ok(state, []);
    const real = new URLSearchParams(query);
    real.delete("departmentId");
    real.delete("submissionId");
    return { ...ok(state, null), forward: `/api/master-courses?${real}` };
  }

  if (area === "courses") {
    if (!id && method === "GET" && query.get("submissionId") === PRACTICE_IDS.draft) return ok(state, listCourses(state, query.get("level")));
    if (!id && method === "POST") return addCourse(state, viewer, body);
    if (id === "bulk" && method === "POST") return importCourses(state, viewer, Array.isArray(body.rows) ? body.rows : []);
    if (id === "bulk" && method === "DELETE") return removeCourses(state, viewer, Array.isArray(body.ids) ? body.ids.map(String) : []);
    if (id && isPracticeId(id)) {
      const course = state.courses.find((item) => item.id === id);
      if (!sub) {
        if (method === "GET") return course ? ok(state, courseOut(state, course)) : refuse(state, 404, "Course not found");
        if (method === "PATCH" || method === "PUT") return changeCourse(state, viewer, id, body);
        if (method === "DELETE") return removeCourses(state, viewer, [id]);
      }
      if (sub === "description") {
        const description = state.descriptions.find((item) => item.courseId === id);
        if (method === "GET") return ok(state, description ? descriptionOut(description) : null);
        if (method === "PUT" || method === "POST" || method === "PATCH") return saveDescription(state, viewer, id, body);
      }
    }
  }

  if (area === "staff") {
    if (!id && method === "GET") return ok(state, state.staff.filter((member) => member.isActive).map(staffOut));
    if (!id && method === "POST") return saveStaff(state, viewer, null, body);
    if (id === "bulk" && method === "POST") return refuse(state, 400, "Bulk staff upload isn't part of the practice programme. Add one person to try it.");
    if (id && isPracticeId(id) && !sub && (method === "PATCH" || method === "PUT")) return saveStaff(state, viewer, id, body);
    if (id && isPracticeId(id) && !sub && method === "DELETE") return saveStaff(state, viewer, id, body, true);
    if (id && isPracticeId(id) && sub === "image" && method === "DELETE") return ok(state, { success: true });
  }

  if (area === "bulletin" && id === "generate" && method === "GET") return ok(state, practicePreview(state));
  // The practice programme has no deadline: the countdown stays hidden.
  if (area === "calendar" && id === "desk" && method === "GET") return ok(state, { cycle: null });
  if (area === "bulletin" && id === "export") {
    return refuse(state, 409, "Word and PDF files are made from your real programme, not the practice one.", { code: "PRACTICE" });
  }

  // GRACE checks cost a model call each: they run on real programmes only.
  if (area === "grace-check") {
    const own = state.courses.filter((course) => !course.isGeneralEducation);
    const written = own.filter((course) => state.descriptions.some((item) => item.courseId === course.id && (item.courseContent || item.learningOutcomes.length)));
    const progress = { total: own.length, missing: own.length - written.length, pending: written.length, checking: 0, compliant: 0, needsRevision: 0, error: 0 };
    if (id === "progress") return ok(state, { progress });
    if (id === "process") return ok(state, { processed: 0, progress });
    return refuse(state, 409, "GRACE checks run on your real programme's course descriptions, not in the practice programme.", { code: "PRACTICE" });
  }

  if (method === "GET") return refuse(state, 404, NOT_HERE);
  return refuse(state, 409, NOT_HERE, { code: "PRACTICE" });
}
