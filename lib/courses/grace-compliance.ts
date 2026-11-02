import { createHash } from "node:crypto";
import { Prisma, type GraceStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  GraceServiceError,
  runGraceCheck,
  type GraceAnalysisResult,
} from "@/lib/grace";

type GraceDb = Pick<
  Prisma.TransactionClient,
  "course" | "courseDescription" | "graceAssessment"
>;

export type CourseGraceInput = {
  title: string;
  courseContent: string | null | undefined;
  learningOutcomes: unknown;
};

export type CourseGraceState = {
  graceStatus: GraceStatus;
  graceContentHash: string | null;
  gracePass: boolean;
  graceResult: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  graceCheckedAt: Date | null;
};

export type GraceProgress = {
  total: number;
  missing: number;
  pending: number;
  checking: number;
  compliant: number;
  needsRevision: number;
  error: number;
};

const STALE_CHECK_MINUTES = 5;
const MAX_AUTOMATIC_ATTEMPTS = 3;

export function normalizeLearningOutcomes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFingerprintText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function courseGraceContentHash(input: CourseGraceInput): string | null {
  const courseContent = input.courseContent?.trim() || "";
  if (!courseContent) return null;

  const payload = JSON.stringify({
    version: 2,
    title: normalizeFingerprintText(input.title).toLocaleLowerCase(),
    courseContent: normalizeFingerprintText(courseContent),
    learningOutcomes: normalizeLearningOutcomes(input.learningOutcomes).map(
      normalizeFingerprintText,
    ),
  });
  return createHash("sha256").update(payload).digest("hex");
}

function persistedResult(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

/** Ensures the current course text has one shared, reusable assessment. */
export async function prepareCourseGraceState(
  db: GraceDb,
  input: CourseGraceInput,
): Promise<CourseGraceState> {
  const courseContent = input.courseContent?.trim() || "";
  const learningOutcomes = normalizeLearningOutcomes(input.learningOutcomes);
  const contentHash = courseGraceContentHash({
    ...input,
    courseContent,
    learningOutcomes,
  });

  if (!contentHash) {
    return {
      graceStatus: "PENDING",
      graceContentHash: null,
      gracePass: false,
      graceResult: Prisma.JsonNull,
      graceCheckedAt: null,
    };
  }

  const assessment = await db.graceAssessment.upsert({
    where: { contentHash },
    create: {
      contentHash,
      title: input.title.trim(),
      courseContent,
      learningOutcomes,
    },
    update: {},
  });

  return {
    graceStatus: assessment.status,
    graceContentHash: contentHash,
    gracePass: assessment.status === "COMPLIANT",
    graceResult: persistedResult(assessment.result),
    graceCheckedAt: assessment.checkedAt,
  };
}

export async function synchronizeCourseGraceAssessment(
  courseId: string,
  db: GraceDb = prisma,
) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      description: {
        select: {
          id: true,
          courseContent: true,
          learningOutcomes: true,
          graceContentHash: true,
        },
      },
    },
  });
  if (!course?.description) return null;

  const expectedHash = courseGraceContentHash({
    title: course.title,
    courseContent: course.description.courseContent,
    learningOutcomes: course.description.learningOutcomes,
  });
  if (expectedHash === course.description.graceContentHash) {
    return course.description;
  }

  const state = await prepareCourseGraceState(db, {
    title: course.title,
    courseContent: course.description.courseContent,
    learningOutcomes: course.description.learningOutcomes,
  });
  return db.courseDescription.update({
    where: { id: course.description.id },
    data: state,
  });
}

export async function synchronizeSubmissionGraceAssessments(
  submissionId: string,
) {
  const courses = await prisma.course.findMany({
    where: { submissionId, description: { isNot: null } },
    select: {
      title: true,
      description: {
        select: {
          id: true,
          courseContent: true,
          learningOutcomes: true,
          graceContentHash: true,
        },
      },
    },
  });
  for (const course of courses) {
    if (!course.description) continue;
    const expectedHash = courseGraceContentHash({
      title: course.title,
      courseContent: course.description.courseContent,
      learningOutcomes: course.description.learningOutcomes,
    });
    if (expectedHash === course.description.graceContentHash) continue;

    const state = await prepareCourseGraceState(prisma, {
      title: course.title,
      courseContent: course.description.courseContent,
      learningOutcomes: course.description.learningOutcomes,
    });
    await prisma.courseDescription.update({
      where: { id: course.description.id },
      data: state,
    });
  }
}

async function publishAssessmentResult(
  contentHash: string,
  status: GraceStatus,
  result: GraceAnalysisResult | null,
  error: string | null,
) {
  const checkedAt = result ? new Date() : null;
  const jsonResult = result
    ? (result as unknown as Prisma.InputJsonValue)
    : Prisma.JsonNull;

  await prisma.$transaction([
    prisma.graceAssessment.update({
      where: { contentHash },
      data: { status, result: jsonResult, error, checkedAt },
    }),
    prisma.courseDescription.updateMany({
      where: { graceContentHash: contentHash },
      data: {
        graceStatus: status,
        gracePass: status === "COMPLIANT",
        graceResult: jsonResult,
        graceCheckedAt: checkedAt,
      },
    }),
  ]);
}

export async function processGraceAssessment(
  contentHash: string,
  options: { retry?: boolean } = {},
) {
  if (options.retry) {
    await prisma.graceAssessment.updateMany({
      where: { contentHash, status: "ERROR" },
      data: { status: "PENDING", attempts: 0, error: null },
    });
  }

  const staleBefore = new Date(
    Date.now() - STALE_CHECK_MINUTES * 60 * 1000,
  );
  const claimed = await prisma.graceAssessment.updateMany({
    where: {
      contentHash,
      OR: [
        { status: "PENDING" },
        { status: "ERROR", attempts: { lt: MAX_AUTOMATIC_ATTEMPTS } },
        { status: "CHECKING", updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: "CHECKING", attempts: { increment: 1 }, error: null },
  });

  if (claimed.count === 0) {
    return prisma.graceAssessment.findUnique({ where: { contentHash } });
  }

  const assessment = await prisma.graceAssessment.findUnique({
    where: { contentHash },
  });
  if (!assessment) return null;

  try {
    const result = await runGraceCheck(
      assessment.title,
      assessment.courseContent,
      { learningOutcomes: normalizeLearningOutcomes(assessment.learningOutcomes) },
    );
    await publishAssessmentResult(
      contentHash,
      result.passed ? "COMPLIANT" : "NEEDS_REVISION",
      result,
      null,
    );
  } catch (error) {
    const message =
      error instanceof GraceServiceError
        ? error.message
        : "The GRACE compliance service is temporarily unavailable.";
    await publishAssessmentResult(contentHash, "ERROR", null, message);
  }

  return prisma.graceAssessment.findUnique({ where: { contentHash } });
}

export async function getSubmissionGraceProgress(
  submissionId: string,
): Promise<GraceProgress> {
  const courses = await prisma.course.findMany({
    where: { submissionId },
    select: {
      description: {
        select: { courseContent: true, graceStatus: true },
      },
    },
  });
  const progress: GraceProgress = {
    total: courses.length,
    missing: 0,
    pending: 0,
    checking: 0,
    compliant: 0,
    needsRevision: 0,
    error: 0,
  };
  for (const course of courses) {
    if (!course.description?.courseContent?.trim()) {
      progress.missing += 1;
      continue;
    }
    if (course.description.graceStatus === "PENDING") progress.pending += 1;
    if (course.description.graceStatus === "CHECKING") progress.checking += 1;
    if (course.description.graceStatus === "COMPLIANT") progress.compliant += 1;
    if (course.description.graceStatus === "NEEDS_REVISION") {
      progress.needsRevision += 1;
    }
    if (course.description.graceStatus === "ERROR") progress.error += 1;
  }
  return progress;
}

/** Bulletins that can still be edited and submitted. */
const ACTIVE_SUBMISSION_STATUSES = ["DRAFT", "CORRECTIONS_REQUIRED"] as const;

export async function processPendingGraceAssessments(options: {
  submissionId?: string;
  limit?: number;
  /** Only descriptions in bulletins that can still be edited and submitted. */
  activeOnly?: boolean;
}) {
  if (options.submissionId) {
    await synchronizeSubmissionGraceAssessments(options.submissionId);
  }

  const limit = Math.max(1, Math.min(options.limit ?? 3, 10));
  const staleBefore = new Date(
    Date.now() - STALE_CHECK_MINUTES * 60 * 1000,
  );
  // Pick runnable checks directly, so checks that have used up their
  // automatic retries can never crowd out ones still waiting.
  const assessments = await prisma.graceAssessment.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "ERROR", attempts: { lt: MAX_AUTOMATIC_ATTEMPTS } },
        { status: "CHECKING", updatedAt: { lt: staleBefore } },
      ],
      courseDescriptions: {
        some: {
          ...(options.submissionId && { submissionId: options.submissionId }),
          ...(options.activeOnly && {
            submission: { status: { in: [...ACTIVE_SUBMISSION_STATUSES] } },
          }),
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { contentHash: true },
  });

  await Promise.all(
    assessments.map((assessment) =>
      processGraceAssessment(assessment.contentHash),
    ),
  );

  const progress = options.submissionId
    ? await getSubmissionGraceProgress(options.submissionId)
    : null;
  return { processed: assessments.length, progress };
}

export type CourseGraceBlockers = {
  missing: string[];
  pending: string[];
  checking: string[];
  needsRevision: string[];
  error: string[];
  changed: string[];
};

export async function getCourseGraceBlockers(
  submissionId: string,
): Promise<CourseGraceBlockers> {
  const courses = await prisma.course.findMany({
    where: { submissionId },
    select: {
      code: true,
      title: true,
      description: {
        select: {
          courseContent: true,
          learningOutcomes: true,
          graceStatus: true,
          graceContentHash: true,
          gracePass: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });
  const blockers: CourseGraceBlockers = {
    missing: [],
    pending: [],
    checking: [],
    needsRevision: [],
    error: [],
    changed: [],
  };

  for (const course of courses) {
    const description = course.description;
    if (!description?.courseContent?.trim()) {
      blockers.missing.push(course.code);
      continue;
    }
    const expectedHash = courseGraceContentHash({
      title: course.title,
      courseContent: description.courseContent,
      learningOutcomes: description.learningOutcomes,
    });
    if (expectedHash !== description.graceContentHash) {
      blockers.changed.push(course.code);
      continue;
    }
    if (description.graceStatus === "COMPLIANT" && description.gracePass) {
      continue;
    }
    if (description.graceStatus === "PENDING") blockers.pending.push(course.code);
    if (description.graceStatus === "CHECKING") blockers.checking.push(course.code);
    if (description.graceStatus === "NEEDS_REVISION") {
      blockers.needsRevision.push(course.code);
    }
    if (description.graceStatus === "ERROR") blockers.error.push(course.code);
  }
  return blockers;
}

export function hasCourseGraceBlockers(blockers: CourseGraceBlockers): boolean {
  return Object.values(blockers).some((courses) => courses.length > 0);
}

export function describeCourseGraceBlockers(
  blockers: CourseGraceBlockers,
): string[] {
  const messages: string[] = [];
  if (blockers.missing.length) {
    messages.push(`Missing course descriptions: ${blockers.missing.join(", ")}`);
  }
  if (blockers.pending.length) {
    messages.push(`Waiting for GRACE checks: ${blockers.pending.join(", ")}`);
  }
  if (blockers.checking.length) {
    messages.push(`GRACE checks still running: ${blockers.checking.join(", ")}`);
  }
  if (blockers.needsRevision.length) {
    messages.push(
      `Course descriptions requiring corrections: ${blockers.needsRevision.join(", ")}`,
    );
  }
  if (blockers.error.length) {
    messages.push(`GRACE checks that must be retried: ${blockers.error.join(", ")}`);
  }
  if (blockers.changed.length) {
    messages.push(
      `Course descriptions changed after their last check: ${blockers.changed.join(", ")}`,
    );
  }
  return messages;
}
