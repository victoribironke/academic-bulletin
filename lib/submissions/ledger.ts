/**
 * The workflow ledger: one phase_transitions row per change of a bulletin's
 * phase or status, written in the same transaction as the change and never
 * edited afterwards. Each row records who acted, in which role, and a
 * fingerprint of the bulletin's content at that moment.
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

type LedgerDatabase = Pick<
  Prisma.TransactionClient,
  "submissionContent" | "course" | "$executeRaw"
>;

/** Fields that record checks or bookkeeping rather than the bulletin's text. */
const NON_CONTENT_FIELDS = new Set([
  "id",
  "submissionId",
  "createdAt",
  "updatedAt",
  "philosophyGracePass",
  "philosophyGrace",
]);

/** JSON with object keys sorted, so equal content always hashes the same. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export type LedgerCourse = {
  code: string;
  title: string;
  units: number;
  status: string;
  semester: number;
  level: number;
  prerequisites: string | null;
  description: {
    learningOutcomes: unknown;
    courseContent: string | null;
    labWork: string | null;
    entrepreneurialAspect: string | null;
  } | null;
};

/**
 * Fingerprint of a bulletin's content: its programme sections and its courses
 * with their descriptions. Check results and timestamps are left out, so the
 * fingerprint changes only when the text does.
 */
export function bulletinFingerprint(
  content: Record<string, unknown> | null,
  courses: LedgerCourse[],
): string {
  const sections = Object.fromEntries(
    Object.entries(content ?? {}).filter(([key]) => !NON_CONTENT_FIELDS.has(key)),
  );
  const orderedCourses = [...courses].sort((a, b) => a.code.localeCompare(b.code));
  return createHash("sha256")
    .update(stableStringify({ sections, courses: orderedCourses }))
    .digest("hex");
}

export async function bulletinContentHash(
  database: LedgerDatabase,
  submissionId: string,
): Promise<string> {
  const [content, courses] = await Promise.all([
    database.submissionContent.findUnique({ where: { submissionId } }),
    database.course.findMany({
      where: { submissionId },
      select: {
        code: true,
        title: true,
        units: true,
        status: true,
        semester: true,
        level: true,
        prerequisites: true,
        description: {
          select: {
            learningOutcomes: true,
            courseContent: true,
            labWork: true,
            entrepreneurialAspect: true,
          },
        },
      },
    }),
  ]);
  return bulletinFingerprint(content as Record<string, unknown> | null, courses);
}

/**
 * Names the ledger row for the phase or status change that follows in this
 * transaction. The database refuses the change without it (ledger guards).
 */
export async function linkStateChangeToLedger(
  database: LedgerDatabase,
  transitionId: string,
): Promise<void> {
  await database.$executeRaw`SELECT set_config('app.ledger_transition', ${transitionId}, true)`;
}
