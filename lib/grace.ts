/**
 * GRACE checks, run directly against Gemini from the Next.js server.
 *
 * Two checks:
 *  - runGraceCheck: scores a course description / philosophy against the
 *    five GRACE pillars.
 *  - checkProfessionalImageFile: decides whether a photo is fit for the bulletin.
 *
 * Server-only: never import this from a client component (it reads the API key).
 */
import { GEMINI_MODEL } from "@/lib/site-config";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

export const GRACE_MODEL = GEMINI_MODEL;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

const SYSTEM_INSTRUCTION =
  "You are a specialized institutional compliance auditor for Babcock University. " +
  "Output ONLY valid JSON.";

const pillar = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    summary: { type: Type.STRING },
  },
  required: ["score", "summary"],
};

const GRACE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    G_Global_Relevance: pillar,
    R_Research_Focus: pillar,
    A_Adventist_Rooted: pillar,
    C_Competent_Community: pillar,
    E_Entrepreneurship: pillar,
    Vision_Alignment_Summary: { type: Type.STRING },
  },
  required: [
    "G_Global_Relevance",
    "R_Research_Focus",
    "A_Adventist_Rooted",
    "C_Competent_Community",
    "E_Entrepreneurship",
    "Vision_Alignment_Summary",
  ],
};

const IMAGE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    result: { type: Type.STRING, enum: ["pass", "fail"] },
    reason: { type: Type.STRING },
  },
  required: ["result", "reason"],
};

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

Task: provide a score (0-5) for each pillar and a brief "Vision Alignment" summary.
Format: JSON only.`;
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
};

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

  const scoreValues = Object.values(scores);
  const passed = scoreValues.length > 0 && scoreValues.every((s) => s >= 3);

  return {
    scores,
    pillarSummaries,
    explanation,
    recommendation,
    passed,
    modelUsed,
  };
}

function failedResult(explanation: string): GraceAnalysisResult {
  return {
    scores: {},
    pillarSummaries: {},
    explanation,
    recommendation: "",
    passed: false,
  };
}

// ── Checks ───────────────────────────────────────────────────────────────────

/** Scores a course description or philosophy against the GRACE pillars. */
export async function runGraceCheck(
  title: string,
  content: string,
): Promise<GraceAnalysisResult> {
  const ai = getClient();
  if (!ai) {
    return failedResult(
      "GRACE checks are not configured on the server. Please contact an administrator.",
    );
  }

  try {
    const response = await ai.models.generateContent({
      model: GRACE_MODEL,
      contents: createGracePrompt(title, content),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: GRACE_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(60_000),
      },
    });

    const text = response.text?.trim();
    if (!text) return failedResult("No analysis returned. Please try again.");
    return parseGraceAnalysis(text, GRACE_MODEL);
  } catch (error) {
    console.error("GRACE check failed:", error);
    return failedResult("Compliance check failed. Please try again.");
  }
}

export type ImageCheckFailure = {
  ok: false;
  status: 400 | 503;
  message: string;
};

/** Asks Gemini whether a photo is professional enough for the bulletin. */
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

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const response = await ai.models.generateContent({
      model: GRACE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: IMAGE_PROMPT },
            { inlineData: { mimeType: file.type, data } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: IMAGE_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(60_000),
      },
    });

    let result: string | undefined;
    let reason = "";
    try {
      const parsed = JSON.parse(response.text ?? "{}") as {
        result?: string;
        reason?: string;
      };
      result = parsed.result?.toLowerCase();
      reason = parsed.reason?.trim() ?? "";
    } catch {
      // Malformed output is treated as a failed review below.
    }

    if (result === "pass") return { ok: true };

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
