/**
 * Rule W13: the university-wide admission wording, from the Academic Policy
 * (Admissions; Admission Through Transfer and Direct Entry). Every
 * programme's Admission section opens with it, filled in and locked; the
 * Head of Department adds only the programme's own subjects and
 * requirements. Rule V7: Direct Entry and Transfer wording differ from UTME.
 */

export type AdmissionRoute = "utme" | "directEntry" | "transfer";

export const UNIVERSITY_ADMISSION: Record<AdmissionRoute, { title: string; text: string }> = {
  utme: {
    title: "UTME",
    text:
      "At least five credit passes (C6 or better) in WASSCE, GCE O'Level, NECO or NABTEB, in one or two sittings, including English Language for every programme and Mathematics for programmes in the Sciences, Engineering, Social Sciences, Business, Management and Law; an acceptable UTME score; and Babcock University's own screening.",
  },
  directEntry: {
    title: "Direct Entry",
    text:
      "Candidates apply through JAMB Direct Entry with full transcripts. OND, HND, NCE and A-Level results (Cambridge, IJMB, JUPEB or equivalents) are accepted, and the qualification decides whether a student starts at 100 or 200 level; there is no course-by-course credit transfer.",
  },
  transfer: {
    title: "Transfer",
    text:
      "Credits are judged course by course for courses comparable to Babcock's, with at least a C (2.0 on a 4-point scale or 2.5 on a 5-point scale) and an overall C average; they count toward the degree but not the CGPA. Up to 84 credits may come from two-year programmes, and every transfer student completes at least three years at Babcock University.",
  },
};

const comparable = (text: string | null | undefined) =>
  (text ?? "").replace(/<[^>]*>/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Rule V7: the Direct Entry and Transfer requirements mustn't repeat the UTME
 * wording. Returns what to fix, one sentence each.
 */
export function admissionWordingProblems(fields: {
  utmeRequirements?: string | null;
  directEntryRequirements?: string | null;
  transferRequirements?: string | null;
}): string[] {
  const utme = comparable(fields.utmeRequirements);
  if (!utme) return [];
  const problems: string[] = [];
  if (comparable(fields.directEntryRequirements) === utme) {
    problems.push("The Direct Entry requirements repeat the UTME wording; say what Direct Entry candidates need instead.");
  }
  if (comparable(fields.transferRequirements) === utme) {
    problems.push("The Transfer requirements repeat the UTME wording; say what transfer students need instead.");
  }
  return problems;
}
