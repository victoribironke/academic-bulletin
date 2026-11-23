/**
 * Splits the Academic Policy into its sections (task H9): one per heading,
 * with the document's own anchors, so "Academic Load" is a line in the
 * contents and /policy#academic-load opens it. Pure; no database.
 */
import { inlineText, parseInline } from "@/lib/policy/markdown";

export type PolicySection = {
  /** The anchor, as in the document's own contents links, e.g. "academic-load". */
  id: string;
  /** 1 for a chapter (#), 2 and 3 below it. */
  level: 1 | 2 | 3;
  title: string;
  /** The section's own text, as markdown, up to the next heading. */
  body: string;
};

export type PolicyDocument = {
  title: string;
  /** Text between the title and the first section (the cover page). */
  intro: string;
  sections: PolicySection[];
};

const HEADING = /^(#{1,6})\s*(.*?)\s*#*\s*$/;

/** The anchor for a heading, the way the document's contents links write it. */
export function policyAnchor(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ._-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "section"
  );
}

export function splitPolicy(markdown: string): PolicyDocument {
  const lines = markdown.replace(/\r/g, "").split("\n");
  let title = "";
  const intro: string[] = [];
  const sections: PolicySection[] = [];
  const used = new Map<string, number>();
  let current: PolicySection | null = null;
  let body: string[] = [];
  let skipping = false;

  const close = () => {
    if (current) current.body = body.join("\n").trim();
    else if (!skipping) intro.push(...body);
    body = [];
  };

  for (const line of lines) {
    const heading = line.match(HEADING);
    if (!heading) {
      body.push(line);
      continue;
    }
    const text = inlineText(parseInline(heading[2])).trim();
    if (!text) continue; // An empty heading ("# ") adds nothing.
    if (!title) {
      // The document's own title; what follows is the cover page.
      title = text;
      body = [];
      continue;
    }
    close();
    if (/^table of contents$/i.test(text)) {
      // The page builds its own contents list.
      current = null;
      skipping = true;
      continue;
    }
    skipping = false;
    const base = policyAnchor(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    current = {
      id: seen === 0 ? base : `${base}-${seen}`,
      level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
      title: text,
      body: "",
    };
    sections.push(current);
  }
  close();
  return { title, intro: intro.join("\n").trim(), sections };
}
