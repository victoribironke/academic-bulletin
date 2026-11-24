/**
 * Task H6: Ask DAP. A question about one section or field of a draft goes to
 * the DAP officer for the programme's school, who aims to answer within one
 * working day: by the end of the next working day after it was asked. DAP's
 * inbox lists every question with its status and an overdue flag.
 *
 * Until the H6 migration has run on a database, the table doesn't exist:
 * callers check isNotSwitchedOn and the pages hide the button.
 */
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { loadActiveCycleCalendar } from "@/lib/calendar/desk";
import {
  DEFAULT_WORKING_WEEK,
  addDays,
  dateKeyAt,
  deadlineInstant,
  isWorkingDay,
  type WorkingCalendar,
} from "@/lib/calendar/dates";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { renderEmail } from "@/lib/email/notifications";
import { getSiteUrl } from "@/lib/site-url";
import { isNotSwitchedOn } from "@/lib/courses/course-list";

export { isNotSwitchedOn };
export const ASK_DAP_NOT_SWITCHED_ON = "Ask DAP isn't switched on yet on this site (task H6 needs its database update).";
export const QUESTION_LENGTH = { min: 10, max: 2000 } as const;

/** The draft sections a question can be about (the page's left-hand list). */
export const SECTION_TITLES: Record<string, string> = {
  deans_hods: "Deans & HODs",
  staff: "Staff Directory",
  overview: "Programme Overview",
  admission: "Admission Requirements",
  graduation: "Graduation Requirements",
  courses: "Course Structure",
  descriptions: "Course Details",
  regulations: "Regulations & Changes",
};

/** The end of the next working day after `asked` (one working day to answer). */
export function answerDueBy(asked: Date, calendar: WorkingCalendar): Date {
  let key = addDays(dateKeyAt(asked), 1);
  for (let guard = 0; guard < 60 && !isWorkingDay(key, calendar); guard += 1) key = addDays(key, 1);
  return deadlineInstant(key);
}

export function isOverdue(question: { status: string; dueAt: Date | string }, now: Date): boolean {
  return question.status === "OPEN" && new Date(question.dueAt).getTime() < now.getTime();
}

export function questionProblem(input: { section?: unknown; question?: unknown }): string | null {
  if (typeof input.section !== "string" || !(input.section in SECTION_TITLES)) return "Choose the section the question is about.";
  const text = typeof input.question === "string" ? input.question.trim() : "";
  if (text.length < QUESTION_LENGTH.min) return `Write the question in at least ${QUESTION_LENGTH.min} characters.`;
  if (text.length > QUESTION_LENGTH.max) return `Keep the question under ${QUESTION_LENGTH.max} characters.`;
  return null;
}

const personName = (person: { title?: string | null; firstName: string; lastName: string } | null) =>
  person ? [person.title, person.firstName, person.lastName].filter(Boolean).join(" ") : null;

const questionSelect = {
  id: true,
  submissionId: true,
  section: true,
  field: true,
  question: true,
  status: true,
  answer: true,
  askedAt: true,
  dueAt: true,
  answeredAt: true,
  askedBy: { select: { title: true, firstName: true, lastName: true, email: true } },
  officer: { select: { id: true, title: true, firstName: true, lastName: true } },
  answeredBy: { select: { title: true, firstName: true, lastName: true } },
  submission: {
    select: {
      programme: { select: { name: true, department: { select: { name: true, school: { select: { name: true, code: true } } } } } },
    },
  },
} as const;

type LoadedQuestion = {
  id: string;
  submissionId: string;
  section: string;
  field: string | null;
  question: string;
  status: string;
  answer: string | null;
  askedAt: Date;
  dueAt: Date;
  answeredAt: Date | null;
  askedBy: { title: string | null; firstName: string; lastName: string; email: string };
  officer: { id: string; title: string | null; firstName: string; lastName: string } | null;
  answeredBy: { title: string | null; firstName: string; lastName: string } | null;
  submission: { programme: { name: string; department: { name: string; school: { name: string; code: string } } } };
};

export function questionView(question: LoadedQuestion, now: Date) {
  return {
    id: question.id,
    submissionId: question.submissionId,
    section: question.section,
    sectionTitle: SECTION_TITLES[question.section] ?? question.section,
    field: question.field,
    question: question.question,
    status: question.status,
    answer: question.answer,
    askedAt: question.askedAt.toISOString(),
    dueAt: question.dueAt.toISOString(),
    overdue: isOverdue(question, now),
    answeredAt: question.answeredAt?.toISOString() ?? null,
    askedBy: personName(question.askedBy),
    officerId: question.officer?.id ?? null,
    officer: personName(question.officer),
    answeredBy: personName(question.answeredBy),
    programme: question.submission.programme.name,
    department: question.submission.programme.department.name,
    school: question.submission.programme.department.school.name,
  };
}
export type QuestionView = ReturnType<typeof questionView>;

async function workingCalendar(): Promise<WorkingCalendar> {
  const cycle = await loadActiveCycleCalendar();
  return cycle?.calendar ?? { workingWeek: DEFAULT_WORKING_WEEK, holidays: [], breaks: [] };
}

/** Asks DAP; the officer for the programme's school gets it, and an email. */
export async function askDap(
  submissionId: string,
  askedById: string,
  input: { section: string; field?: string | null; question: string },
  now = new Date(),
): Promise<QuestionView> {
  const draft = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { programme: { select: { name: true, department: { select: { schoolId: true } } } } },
  });
  const officer = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, schoolId: draft.programme.department.schoolId },
    select: { id: true, email: true, firstName: true },
    orderBy: { createdAt: "asc" },
  });
  const dueAt = answerDueBy(now, await workingCalendar());
  const field = input.field?.trim().slice(0, 100) || null;
  const created = await prisma.$transaction(async (tx) => {
    const question = await tx.dapQuestion.create({
      data: {
        submissionId,
        section: input.section,
        field,
        question: input.question.trim(),
        askedById,
        askedAt: now,
        dueAt,
        officerId: officer?.id ?? null,
      },
      select: questionSelect,
    });
    await recordActivity(
      {
        actorId: askedById,
        action: "DAP_QUESTION_ASKED",
        entityType: "SUBMISSION",
        entityId: submissionId,
        description: `Asked DAP about ${SECTION_TITLES[input.section]}${field ? `, ${field}` : ""}.`,
        metadata: { questionId: question.id, section: input.section, field },
      },
      tx,
    );
    return question;
  });

  if (officer && isEmailConfigured()) {
    const view = questionView(created, now);
    const content = renderEmail({
      heading: "A question for DAP",
      intro: `Hello ${officer.firstName}, ${view.askedBy} asked a question about ${view.programme}. Please answer within one working day.`,
      details: [
        ["Programme", view.programme],
        ["Section", `${view.sectionTitle}${field ? `: ${field}` : ""}`],
        ["Question", view.question],
      ],
      link: `${getSiteUrl()}/dap-questions`,
      linkLabel: "Answer in the DAP inbox",
    });
    await sendEmail({ to: [officer.email], subject: `Question about ${view.programme}`, ...content }).catch(() => false);
  }
  return questionView(created, now);
}

export async function questionsForDraft(submissionId: string, now = new Date()): Promise<QuestionView[]> {
  const questions = await prisma.dapQuestion.findMany({
    where: { submissionId },
    orderBy: { askedAt: "desc" },
    select: questionSelect,
  });
  return questions.map((question) => questionView(question, now));
}

/** DAP's inbox: open questions first (overdue first), then the rest, newest first. */
export async function dapInbox(filter: { status?: "OPEN" | "ANSWERED"; officerId?: string }, now = new Date()) {
  const questions = await prisma.dapQuestion.findMany({
    where: { ...(filter.status && { status: filter.status }), ...(filter.officerId && { officerId: filter.officerId }) },
    orderBy: { askedAt: "desc" },
    take: 500,
    select: questionSelect,
  });
  return questions
    .map((question) => questionView(question, now))
    .sort(
      (a, b) =>
        Number(b.status === "OPEN") - Number(a.status === "OPEN") ||
        Number(b.overdue) - Number(a.overdue) ||
        (a.status === "OPEN" ? a.dueAt.localeCompare(b.dueAt) : b.askedAt.localeCompare(a.askedAt)),
    );
}

/** DAP answers; the person who asked gets an email with a link to the section. */
export async function answerQuestion(id: string, answeredById: string, answer: string, now = new Date()) {
  const existing = await prisma.dapQuestion.findUnique({ where: { id }, select: { id: true, submissionId: true } });
  if (!existing) return null;
  const updated = await prisma.$transaction(async (tx) => {
    const question = await tx.dapQuestion.update({
      where: { id },
      data: { status: "ANSWERED", answer: answer.trim(), answeredById, answeredAt: now },
      select: questionSelect,
    });
    await recordActivity(
      {
        actorId: answeredById,
        action: "DAP_QUESTION_ANSWERED",
        entityType: "SUBMISSION",
        entityId: existing.submissionId,
        description: `Answered a question about ${SECTION_TITLES[question.section] ?? question.section}.`,
        metadata: { questionId: id },
      },
      tx,
    );
    return question;
  });
  if (isEmailConfigured()) {
    const view = questionView(updated, now);
    const content = renderEmail({
      heading: "DAP answered your question",
      intro: `Hello ${updated.askedBy.firstName}, ${view.answeredBy ?? "DAP"} answered your question about ${view.programme}.`,
      details: [
        ["Section", `${view.sectionTitle}${view.field ? `: ${view.field}` : ""}`],
        ["Your question", view.question],
        ["Answer", view.answer ?? ""],
      ],
      link: `${getSiteUrl()}/submissions/${view.submissionId}?section=${view.section}`,
      linkLabel: "Open the section",
    });
    await sendEmail({ to: [updated.askedBy.email], subject: `DAP answered: ${view.programme}`, ...content }).catch(() => false);
  }
  return questionView(updated, now);
}
