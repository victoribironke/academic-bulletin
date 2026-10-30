/**
 * GRACE checks, run with Claude (Anthropic API) from the Next.js server.
 *
 * Two checks:
 *  - runGraceCheck: scores a course description / philosophy against the
 *    five GRACE pillars.
 *  - checkProfessionalImageFile: decides whether a photo is fit for the bulletin.
 *
 * Server-only: never import this from a client component (it reads the API key).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AI_MODEL } from "@/lib/site-config";

export const GRACE_MODEL = AI_MODEL;
export const GRACE_MINIMUM_WORDS = 150;

export class GraceServiceError extends Error {
  readonly status: 503;

  constructor(message: string) {
    super(message);
    this.name = "GraceServiceError";
    this.status = 503;
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  // One retry keeps a temporary hiccup from failing the check, without making
  // the person wait through several back-offs.
  if (!client) client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  return client;
}

const SYSTEM_INSTRUCTION =
  "You are a specialized institutional compliance auditor for Babcock University.";

const Pillar = z.object({
  score: z.number().int().describe("Score from 0 to 5 using the rubric"),
  summary: z.string(),
});

const GraceResponse = z.object({
  G_Global_Relevance: Pillar,
  R_Research_Focus: Pillar,
  A_Adventist_Rooted: Pillar,
  C_Competent_Community: Pillar,
  E_Entrepreneurship: Pillar,
  Vision_Alignment_Summary: z.string(),
});

const ImageResponse = z.object({
  result: z.enum(["pass", "fail"]),
  reason: z.string(),
});

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const IMAGE_MEDIA_TYPES: ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

function createGracePrompt(title: string, content: string): string {
  return `Evaluate if this course description aligns with the Administration's GRACE vision.

GRACE PILLARS:
- G (Global Relevance): Prepares students for international impact/standards.
- R (Research Focus): Emphasizes inquiry, data, and evidence-based learning.
- A (Adventist Rooted): Integrates faith, holistic values (Head, Heart, Hand), and service.
- C (Competent Community): Fosters professional skill-sharing and community upliftment.
- E (Entrepreneurship): Encourages innovation, self-reliance, and a business mindset.

SCORING RUBRIC:
- 0: No relevance or mention whatsoever.
- 1: Very loose or highly theoretical connection; not an actual focus.
- 2: Minor connection exists, but it's an accidental byproduct rather than an objective.
- 3: Moderate connection; explicitly mentioned but not a major focus.
- 4: Strong connection; the pillar is explicitly stated and integrated as a core component of the course.
- 5: Exceptional alignment; the course perfectly exemplifies the pillar as a primary, undeniable focus.

DIRECTIVE: Be highly strict. DO NOT award high scores (3, 4, or 5) unless the course description explicitly contains language and goals directly validating that pillar. Do not assume or extrapolate.
## NOTE:  FAIL EVERYTHING THAT DOES NOT MEET THE MINIMUM REQUIREMENT OF 150 WORDS AND EVERY CHECK HAS TO BE VERY VERY STRICT IN THE SENSE THAT GRACE SHOULDNT JUST BE SPELT OUT BUT MUST BE EMBODIED IN WHATEVER IS INPUTED.
Course Title: ${title}
Description: "${content}"

Task: provide a score (0-5) for each pillar and a brief "Vision Alignment" summary.`;
}

const IMAGE_PROMPT =
  "You are a professional content auditor for an institutional bulletin. " +
  "Evaluate if this image is professional and fit for submission in an official, high-quality university bulletin. " +
  "It should be in focus, appropriately framed, visually pleasing, and suitable for a professional academic context. " +
  "IT SHOULD NOT BE BLURRY BUT CLEAR. IT SHOULD BE A PORTRAIT. IT SHOULD HAVE A SUITABLE BACKGROUND. " +
  "IF IT DOES NOT MEET ANY OF THESE REQUIREMENTS IT SHOULD FAIL AND THE REASON SHOULD BE EXPLAINED. " +
  "Return the result as 'pass' or 'fail', and explain your reasoning.";

// ── Result parsing ───────────────────────────────────────────────────────────

const NEW_PILLAR_KEYS = [
  "G_Global_Relevance",
  "R_Research_Focus",
  "A_Adventist_Rooted",
  "C_Competent_Community",
  "E_Entrepreneurship",
] as const;

export type GraceAnalysisResult = {
  scores: Record<string, number>;
  pillarSummaries: Record<string, string>;
  explanation: string;
  recommendation: string;
  passed: boolean;
  modelUsed?: string;
  wordCount?: number;
};

export function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function parseNewGraceShape(obj: Record<string, unknown>): {
  scores: Record<string, number>;
  pillarSummaries: Record<string, string>;
  explanation: string;
} {
  const scores: Record<string, number> = {};
  const pillarSummaries: Record<string, string> = {};

  for (const key of NEW_PILLAR_KEYS) {
    if (!(key in obj)) continue;
    const val = obj[key];
    if (typeof val !== "object" || val === null) continue;
    const letter = key[0];
    const rec = val as { score?: unknown; summary?: unknown };
    if (typeof rec.score === "number") {
      scores[letter] = rec.score;
    }
    if (typeof rec.summary === "string" && rec.summary.trim()) {
      pillarSummaries[letter] = rec.summary.trim();
    }
  }

  const explanation =
    (typeof obj.Vision_Alignment_Summary === "string" &&
      obj.Vision_Alignment_Summary.trim()) ||
    (typeof obj.Vision_Alignment === "string" && obj.Vision_Alignment.trim()) ||
    "";

  return { scores, pillarSummaries, explanation };
}

/** Turns the model's JSON (string or object) into the shape the UI stores. */
export function parseGraceAnalysis(
  analysis: unknown,
  modelUsed?: string,
): GraceAnalysisResult {
  let scores: Record<string, number> = {};
  let pillarSummaries: Record<string, string> = {};
  let explanation = "";
  let recommendation = "";

  let parsed: unknown = analysis;
  if (typeof parsed === "string") {
    const raw = parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          /* keep string */
        }
      }
    }
  }

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (NEW_PILLAR_KEYS.some((k) => k in obj)) {
      const n = parseNewGraceShape(obj);
      scores = n.scores;
      pillarSummaries = n.pillarSummaries;
      explanation = n.explanation;

      const low = Object.entries(scores).filter(([, s]) => s < 3);
      recommendation = low
        .map(([letter]) => {
          const sum = pillarSummaries[letter];
          return sum ? `${letter}: ${sum}` : "";
        })
        .filter(Boolean)
        .join("\n\n");
    }
  }

  const missingPillars = ["G", "R", "A", "C", "E"].filter(
    (letter) => !Number.isInteger(scores[letter]),
  );
  const invalidScores = Object.values(scores).some(
    (score) => score < 0 || score > 5,
  );
  if (missingPillars.length > 0 || invalidScores) {
    throw new GraceServiceError(
      "The GRACE service returned an incomplete assessment. Please try again.",
    );
  }

  const scoreValues = ["G", "R", "A", "C", "E"].map(
    (letter) => scores[letter],
  );
  const passed = scoreValues.every((s) => s >= 3);

  return {
    scores,
    pillarSummaries,
    explanation,
    recommendation,
    passed,
    modelUsed,
  };
}

function minimumLengthResult(wordCount: number): GraceAnalysisResult {
  return {
    scores: { G: 0, R: 0, A: 0, C: 0, E: 0 },
    pillarSummaries: {},
    explanation: `The submission contains ${wordCount} words. At least ${GRACE_MINIMUM_WORDS} words are required before a GRACE assessment can be completed.`,
    recommendation: `Expand the content to at least ${GRACE_MINIMUM_WORDS} words, then run the GRACE check again.`,
    passed: false,
    wordCount,
  };
}

// ── Checks ───────────────────────────────────────────────────────────────────

/** Scores a course description or philosophy against the GRACE pillars. */
export async function runGraceCheck(
  title: string,
  content: string,
): Promise<GraceAnalysisResult> {
  const wordCount = countWords(content);
  if (wordCount < GRACE_MINIMUM_WORDS) {
    return minimumLengthResult(wordCount);
  }

  const ai = getClient();
  if (!ai) {
    throw new GraceServiceError(
      "GRACE checks are not configured on the server. Please contact an administrator.",
    );
  }

  try {
    const response = await ai.messages.parse({
      model: GRACE_MODEL,
      max_tokens: 8000,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: "user", content: createGracePrompt(title, content) }],
      // A scoring task: light reasoning keeps it quick and cheap.
      output_config: { effort: "low", format: zodOutputFormat(GraceResponse) },
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new GraceServiceError(
        "The GRACE service returned no assessment. Please try again.",
      );
    }
    return {
      ...parseGraceAnalysis(response.parsed_output, GRACE_MODEL),
      wordCount,
    };
  } catch (error) {
    console.error("GRACE check failed:", error);
    if (error instanceof GraceServiceError) throw error;
    throw new GraceServiceError(
      "The GRACE compliance service is temporarily unavailable. Please try again.",
    );
  }
}

export type ImageCheckFailure = {
  ok: false;
  status: 400 | 503;
  message: string;
};

/** Asks Claude whether a photo is professional enough for the bulletin. */
export async function checkProfessionalImageFile(
  file: File,
): Promise<{ ok: true } | ImageCheckFailure> {
  const ai = getClient();
  if (!ai) {
    return {
      ok: false,
      status: 503,
      message:
        "Professional image review is not configured. Please contact an administrator.",
    };
  }

  const mediaType = IMAGE_MEDIA_TYPES.find((t) => t === file.type);
  if (!mediaType) {
    return {
      ok: false,
      status: 400,
      message: "The uploaded file was not accepted as a valid image. Use JPG, PNG, or WEBP.",
    };
  }

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const response = await ai.messages.parse({
      model: GRACE_MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: IMAGE_PROMPT },
          ],
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(ImageResponse) },
    });

    // A refusal or unreadable answer counts as a failed review.
    const parsed = response.stop_reason === "refusal" ? null : response.parsed_output;
    const reason = parsed?.reason.trim() ?? "";

    if (parsed?.result === "pass") return { ok: true };

    return {
      ok: false,
      status: 400,
      message:
        reason ||
        "This image did not pass the professional bulletin standards review.",
    };
  } catch (error) {
    console.error("Image review failed:", error);
    return {
      ok: false,
      status: 503,
      message:
        "Professional image review is temporarily unavailable. Please try again later.",
    };
  }
}
