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

export const PHILOSOPHY_WORD_RANGE = { min: 150, max: 250 } as const;
/** Matches the Minimum CGPA field on the submission page (5-point scale). */
export const MINIMUM_CGPA_RANGE = { min: 1, max: 5 } as const;

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

export function submitReadinessIssues(
  programme: BulletinProgramme,
  content: SubmitReadinessContent,
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
  } else if (
    !Number.isFinite(cgpa) ||
    cgpa < MINIMUM_CGPA_RANGE.min ||
    cgpa > MINIMUM_CGPA_RANGE.max
  ) {
    issues.push({
      code: "CGPA_OUT_OF_RANGE",
      message: `The minimum CGPA is ${cgpa}; it must be between ${MINIMUM_CGPA_RANGE.min.toFixed(2)} and ${MINIMUM_CGPA_RANGE.max.toFixed(2)}.`,
    });
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
  const data = await generateDepartmentBulletin(submission.programmeId, submissionId);
  return submitReadinessIssues(data.programmes[0], submission.content);
}
