/**
 * What a bulletin must hold before it can be submitted. The server runs these
 * checks on every Submit, so a draft the page would stop can't be sent by
 * calling the API directly.
 */
import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { GRACE_SUBMISSION_REQUIRED } from "@/lib/grace-config";
import { cleanText } from "@/lib/bulletin/document-utils";
import {
  generateDepartmentBulletin,
  type BulletinProgramme,
} from "@/lib/bulletin/generation";
import { validateBulletinProgramme } from "@/lib/bulletin/validation";
import { isValidMinimumCgpa, minimumCgpaRuleMessage } from "@/lib/submissions/cgpa-rule";

export const PHILOSOPHY_WORD_RANGE = { min: 150, max: 250 } as const;
export {
  MINIMUM_CGPA_RANGE,
  UNIVERSITY_MINIMUM_CGPA,
  isValidMinimumCgpa,
  minimumCgpaRuleMessage,
} from "@/lib/submissions/cgpa-rule";

export type SubmitReadinessIssue = { code: string; message: string };

/** The stored fields the Submit checks read directly, not via the export data. */
export type SubmitReadinessContent = {
  philosophy: string | null;
  philosophyGracePass: boolean;
  philosophyGrace: unknown;
  minimumDuration: string | null;
  minimumCGPA: number | null;
  totalUnits: number | null;
} | null;

export function countWords(text?: string | null): number {
  return cleanText(text ?? undefined).split(/\s+/).filter(Boolean).length;
}

/**
 * Fingerprint of the philosophy a GRACE result was produced for. Stored with
 * the result so a pass only counts for the text that was actually checked.
 */
export function philosophyGraceHash(philosophy?: string | null): string | null {
  const text = cleanText(philosophy ?? undefined).replace(/\s+/g, " ");
  return text ? createHash("sha256").update(text).digest("hex") : null;
}

/** True only when the stored GRACE pass was produced for the philosophy as saved. */
export function philosophyGraceIsCurrent(content: SubmitReadinessContent): boolean {
  if (!content?.philosophyGracePass) return false;
  const result = content.philosophyGrace as { contentHash?: unknown } | null;
  const hash = philosophyGraceHash(content.philosophy);
  return Boolean(hash) && result?.contentHash === hash;
}

/** Words in a programme name that don't tell programmes apart. */
const GENERIC_NAME_WORDS = new Set([
  "and", "of", "the", "in", "for", "with", "&", "science", "sciences", "studies",
  "education", "technology", "engineering", "management", "arts", "art",
  "programme", "program", "bachelor", "bsc", "b.sc", "ba", "b.a", "hons",
  "honours", "general", "applied",
]);

function nameWords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z.&]+/).filter(Boolean);
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(text: string, phrase: string): boolean {
  const words = phrase.trim().split(/\s+/).map(escapeForRegExp).join("\\s+");
  return new RegExp(`(^|[^a-z])${words}([^a-z]|$)`, "i").test(text);
}

/**
 * A philosophy copied from another programme names that programme and not its
 * own. Returns the other programme's name in that case, else null. Kept
 * conservative so honest text passes: a mention of another field (Law naming
 * "information technology" as an area of law) is fine when the philosophy
 * also names its own programme, and very short names (e.g. "Law") are only
 * checked as the programme's own.
 */
export function philosophyNamesOtherProgramme(
  philosophy: string | null | undefined,
  ownName: string,
  otherNames: string[],
): string | null {
  const text = cleanText(philosophy ?? undefined).replace(/\s+/g, " ");
  if (!text) return null;

  const ownWords = nameWords(ownName);
  const ownWordSet = new Set(ownWords);
  // Words of three letters or more ("Law" counts, the "A" in "Programme A" doesn't).
  const distinctive = ownWords.filter(
    (word) => word.length >= 3 && !GENERIC_NAME_WORDS.has(word),
  );

  for (const other of otherNames) {
    const words = nameWords(other);
    if (words.length === 0 || other.trim().length < 6) continue;
    if (other.trim().toLowerCase() === ownName.trim().toLowerCase()) continue;
    // "Economics" inside "Agricultural Economics ..." is the programme's own field.
    if (words.every((word) => ownWordSet.has(word))) continue;
    if (!mentions(text, other.trim())) continue;

    // It names another programme. It still names itself if it uses a word of
    // its own name that the other name doesn't share ("Agricultural" can't
    // tell Agricultural Economics from Agricultural Engineering), or failing
    // that, its full name.
    const otherWords = new Set(words);
    const telling = distinctive.filter((word) => !otherWords.has(word));
    const namesItself =
      telling.length > 0
        ? telling.some((word) => mentions(text, word))
        : mentions(text, ownName.trim());
    if (!namesItself) return other.trim();
  }
  return null;
}

export function submitReadinessIssues(
  programme: BulletinProgramme,
  content: SubmitReadinessContent,
  otherProgrammeNames: string[] = [],
): SubmitReadinessIssue[] {
  // Everything the export refuses to print, the workflow refuses to send.
  const issues: SubmitReadinessIssue[] = validateBulletinProgramme(programme)
    .filter((item) => item.severity === "error")
    .map(({ code, message }) => ({ code, message }));

  if (cleanText(content?.philosophy ?? undefined)) {
    const words = countWords(content?.philosophy);
    if (words < PHILOSOPHY_WORD_RANGE.min || words > PHILOSOPHY_WORD_RANGE.max) {
      issues.push({
        code: "PHILOSOPHY_LENGTH",
        message: `The programme philosophy has ${words} words; it must have ${PHILOSOPHY_WORD_RANGE.min} to ${PHILOSOPHY_WORD_RANGE.max}.`,
      });
    }
    const otherProgramme = philosophyNamesOtherProgramme(
      content?.philosophy,
      programme.name,
      otherProgrammeNames,
    );
    if (otherProgramme) {
      issues.push({
        code: "PHILOSOPHY_OTHER_PROGRAMME",
        message: `The programme philosophy names ${otherProgramme} but not ${programme.name}. Check it was written for this programme.`,
      });
    }
    if (GRACE_SUBMISSION_REQUIRED && !philosophyGraceIsCurrent(content)) {
      issues.push({
        code: "PHILOSOPHY_GRACE_REQUIRED",
        message:
          "The programme philosophy has not passed GRACE in its current wording. Run the GRACE check again.",
      });
    }
  }

  if (!content?.minimumDuration?.trim()) {
    issues.push({
      code: "MISSING_MINIMUM_DURATION",
      message: "Select the minimum programme duration.",
    });
  }

  const cgpa = content?.minimumCGPA;
  if (cgpa === null || cgpa === undefined) {
    issues.push({ code: "MISSING_MINIMUM_CGPA", message: "Enter the minimum CGPA." });
  } else if (!isValidMinimumCgpa(cgpa)) {
    issues.push({ code: "CGPA_OUT_OF_RANGE", message: minimumCgpaRuleMessage(cgpa) });
  }

  // A stated total that differs from the course structure is reported by the
  // shared validator above; a missing total would skip that comparison.
  if (!content?.totalUnits) {
    issues.push({
      code: "MISSING_TOTAL_UNITS",
      message: "Enter the programme's total credit units.",
    });
  }

  return issues;
}

export async function getSubmitReadinessIssues(
  submissionId: string,
): Promise<SubmitReadinessIssue[]> {
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: {
      programmeId: true,
      content: {
        select: {
          philosophy: true,
          philosophyGracePass: true,
          philosophyGrace: true,
          minimumDuration: true,
          minimumCGPA: true,
          totalUnits: true,
        },
      },
    },
  });
  const [data, programmes] = await Promise.all([
    generateDepartmentBulletin(submission.programmeId, submissionId),
    prisma.programme.findMany({
      where: { id: { not: submission.programmeId } },
      select: { name: true },
    }),
  ]);
  return submitReadinessIssues(
    data.programmes[0],
    submission.content,
    programmes.map((programme) => programme.name),
  );
}
