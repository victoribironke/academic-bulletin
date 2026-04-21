/**
 * GRACE Vision AI (Hugging Face Space) — shared client helpers.
 * @see FRONTEND_API_DOCS — POST /check-grace (JSON), POST /check-image (multipart).
 */

export const GRACE_VISION_SPACE_URL =
  process.env.GRACE_VISION_SPACE_URL?.replace(/\/$/, "") ??
  "https://santacl-grace.hf.space";

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

/**
 * Normalizes GRACE /check-grace response bodies (legacy and current shapes).
 */
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
    const hasNewShape = NEW_PILLAR_KEYS.some((k) => k in obj);

    if (hasNewShape) {
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
    } else if (Array.isArray(obj.GRACE_PILLARS)) {
      obj.GRACE_PILLARS.forEach(
        (p: { pillar?: string; score?: number; summary?: string }) => {
          if (p?.pillar && typeof p.score === "number") {
            scores[p.pillar] = p.score;
          }
          if (p?.pillar && typeof p.summary === "string" && p.summary.trim()) {
            pillarSummaries[p.pillar] = p.summary.trim();
          }
        },
      );
      explanation = (obj.Vision_Alignment ||
        obj.Vision_Alignment_Summary ||
        obj.Explanation ||
        "") as string;
      recommendation = (obj.Recommendation || "") as string;
    } else if (typeof obj.GRACE_PILLARS === "object" && obj.GRACE_PILLARS) {
      scores = obj.GRACE_PILLARS as Record<string, number>;
      explanation = (obj.Vision_Alignment ||
        obj.Vision_Alignment_Summary ||
        obj.Explanation ||
        "") as string;
      recommendation = (obj.Recommendation || "") as string;
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

export type ImageCheckFailure = {
  ok: false;
  status: 400 | 503;
  message: string;
};

/**
 * Calls POST /check-image (multipart field `file`) before storage upload.
 */
export async function checkProfessionalImageFile(
  file: File,
): Promise<{ ok: true } | ImageCheckFailure> {
  const url = `${GRACE_VISION_SPACE_URL}/check-image`;
  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(url, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 503) {
      return {
        ok: false,
        status: 503,
        message:
          "Professional image review is temporarily unavailable. Please try again later.",
      };
    }

    if (res.status === 400) {
      return {
        ok: false,
        status: 400,
        message:
          "The uploaded file was not accepted as a valid image. Use JPG, PNG, or WEBP.",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: 400,
        message: "Image review failed. Please try again.",
      };
    }

    const data = (await res.json()) as {
      analysis?: { result?: string; reason?: string };
    };
    const analysis = data.analysis ?? {};
    const result = analysis.result;
    const reason =
      typeof analysis.reason === "string" ? analysis.reason.trim() : "";

    if (result === "pass") {
      return { ok: true };
    }

    return {
      ok: false,
      status: 400,
      message:
        reason ||
        "This image did not pass the professional bulletin standards review.",
    };
  } catch {
    return {
      ok: false,
      status: 503,
      message:
        "Could not reach the image review service. Please try again later.",
    };
  }
}
