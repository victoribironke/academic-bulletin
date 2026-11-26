import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  OLD_SCREEN_WORDS,
  courseTypeFromSheet,
  courseTypeLabel,
  ownershipFromSheet,
  ownershipLabel,
} from "@/lib/plain-words";
import { validateMasterCourseImportRows } from "@/lib/imports/courses";

// Task U1 (plain words on every screen): "a search of the screen text finds
// none of the words in the left column". The screen text is every piece of
// JSX text and every string a page, component or API route writes, read with
// the TypeScript parser so code (comparisons, object keys, console logs,
// imports) is not mistaken for screen text.

const ROOT = path.resolve(__dirname, "../..");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return /\.(tsx|ts)$/.test(name) && !name.endsWith(".d.ts") ? [full] : [];
  });
}

/** Strings used as code, not shown: compared, switched on, keys, logs, imports. */
function isCode(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return true;
  if (ts.isCaseClause(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isElementAccessExpression(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  // Code lists: ["GST_NUC", "GST_BU"].includes(type), enum value lists.
  if (ts.isArrayLiteralExpression(parent)) return true;
  // { value: "GST_NUC", label: ... }: the value is a code, the label is shown.
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && ["value", "type", "ownership", "kind", "role", "status", "key"].includes(parent.name.text)) return true;
  for (let at: ts.Node | undefined = parent; at; at = at.parent) {
    if (ts.isCallExpression(at)) {
      const callee = at.expression.getText();
      if (/^console\.|^prisma\.|\.(findMany|findFirst|findUnique|count|update|updateMany|create|createMany|upsert|groupBy|includes|startsWith|get|has)$/.test(callee)) return true;
    }
    if (ts.isTypeNode(at)) return true;
  }
  return false;
}

function screenText(file: string): { text: string; line: number }[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isJsxText(node)) text = node.text;
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (!isCode(ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.parent.parent ?? node : node)) text = node.text;
    }
    if (text && text.trim()) found.push({ text, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const SCREENS = [
  ...filesUnder(path.join(ROOT, "app")),
  ...filesUnder(path.join(ROOT, "components")),
  path.join(ROOT, "lib/messages.ts"),
  path.join(ROOT, "lib/courses/course-owners.ts"),
  path.join(ROOT, "lib/desk/waiting.ts"),
];

describe("plain words on every screen (U1)", () => {
  it("finds none of the old words in the screen text", () => {
    const hits: string[] = [];
    for (const file of SCREENS) {
      for (const { text, line } of screenText(file)) {
        for (const word of OLD_SCREEN_WORDS) {
          const caseless = /[a-z]/.test(word);
          if (caseless ? text.toLowerCase().includes(word.toLowerCase()) : text.includes(word)) {
            hits.push(`${path.relative(ROOT, file)}:${line} "${word}" in ${JSON.stringify(text.trim().slice(0, 80))}`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("shows course types and owners in words", () => {
    expect(courseTypeLabel("GST_NUC")).toBe("National General Studies");
    expect(courseTypeLabel("GST_BU")).toBe("Babcock General Education");
    expect(ownershipLabel("INSTITUTIONAL")).toBe("University-wide");
    expect(ownershipLabel("SCHOOL")).toBe("School");
  });

  it("reads a registry sheet in plain words or in the old codes", () => {
    expect(courseTypeFromSheet("NATIONAL_GENERAL_STUDIES")).toBe("GST_NUC");
    expect(courseTypeFromSheet("GST_BU")).toBe("GST_BU");
    expect(ownershipFromSheet("UNIVERSITY_WIDE")).toBe("INSTITUTIONAL");
    expect(ownershipFromSheet("INSTITUTIONAL")).toBe("INSTITUTIONAL");
    const rows = validateMasterCourseImportRows([
      { "Course Code": "GST 111", "Course Title": "Communication in English", Units: 2, "Course Type": "National General Studies", Ownership: "University-wide", Level: 100, Semester: 1, "Show in course search": "NO" },
      { "Course Code": "BU-GST 101", "Course Title": "Citizenship", Units: 1, "Course Type": "GST_BU", Ownership: "INSTITUTIONAL", Level: 100, Semester: 1, Discoverable: "YES" },
    ]);
    expect(rows.map((row) => row.errors)).toEqual([[], []]);
    expect(rows[0].data).toMatchObject({ type: "GST_NUC", ownership: "INSTITUTIONAL", discoverable: false });
    expect(rows[1].data).toMatchObject({ type: "GST_BU", ownership: "INSTITUTIONAL", discoverable: true });
  });
});
