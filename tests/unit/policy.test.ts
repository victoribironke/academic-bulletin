import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Block, blocksText, inlineText, parseBlocks, parseInline } from "@/lib/policy/markdown";
import { policyAnchor, splitPolicy } from "@/lib/policy/sections";
import { checkPolicyUpload } from "@/lib/policy/library";

// Task H9: the Academic Policy library, from package file 04.

const source = readFileSync(join(process.cwd(), "data/policy/academic-policy-2025-09-08.md"), "utf8");
const policy = splitPolicy(source);
const section = (id: string) => policy.sections.find((item) => item.id === id)!;

describe("the Academic Policy, split into sections", () => {
  it("has the title, the cover page and the chapters", () => {
    expect(policy.title).toBe("Babcock University Academic Policy (updated September 8, 2025)");
    expect(policy.intro).toContain("ACADEMIC POLICIES MANUAL");
    expect(policy.sections.length).toBeGreaterThan(70);
    expect(policy.sections.filter((item) => item.level === 1).map((item) => item.title)).toEqual(
      expect.arrayContaining(["Admissions and Matriculation", "Academic Structure and Regulations", "Assessment and Grading Framework"]),
    );
    expect(policy.sections.some((item) => /table of contents/i.test(item.title))).toBe(false);
  });

  it("gives every section the anchor the document's own contents links use", () => {
    const anchors = [...source.matchAll(/\]\(#([^)]+)\)/g)].map((match) => match[1]);
    expect(anchors.length).toBeGreaterThan(60);
    const ids = new Set(policy.sections.map((item) => item.id));
    expect(anchors.filter((anchor) => !ids.has(anchor))).toEqual([]);
    expect(policyAnchor("Oversight & Compliance")).toBe("oversight-compliance");
    expect(policyAnchor("Language Proficiency Programmes (Eng.Prof.)")).toBe("language-proficiency-programmes-eng.prof.");
  });

  it("has Academic Load as its own section, with its rules and nested lists", () => {
    const load = section("academic-load");
    expect(load).toMatchObject({ level: 2, title: "Academic Load" });
    const blocks = parseBlocks(load.body);
    const text = blocksText(blocks);
    expect(text).toContain("minimum of 16 credits");
    expect(text).toContain("A maximum of 24 credits is permitted during regular semesters.");
    const lists = blocks.filter((block): block is Extract<Block, { type: "list" }> => block.type === "list");
    const exceptions = lists.flatMap((list) => list.items).find((item) => inlineText(item.content) === "Such exceptions:");
    expect(exceptions?.children[0]).toMatchObject({ type: "list", ordered: true });
    expect((exceptions!.children[0] as Extract<Block, { type: "list" }>).items).toHaveLength(3);
  });

  it("reads tables and quotes", () => {
    const table = parseBlocks(section("registration-timelines").body).find((block) => block.type === "table");
    expect(table).toBeDefined();
    const { header, rows } = table as Extract<Block, { type: "table" }>;
    expect(header.map(inlineText)).toEqual(["Activity", "Timeline", "Responsible Parties"]);
    expect(rows[0].map(inlineText)).toEqual(["Pre-Registration & Course Advising", "5 weeks before the semester starts", "Students, Advisors"]);
    expect(parseBlocks("> A quoted **rule**.")[0]).toMatchObject({ type: "quote" });
  });
});

describe("reading the markdown safely", () => {
  it("reads bold, italics, links and escapes, and leaves unmatched markers as text", () => {
    expect(parseInline("**bold** and *it*")).toEqual([
      { type: "strong", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: " and " },
      { type: "em", children: [{ type: "text", text: "it" }] },
    ]);
    expect(parseInline("[Academic Load](#academic-load)")).toEqual([
      { type: "link", href: "#academic-load", children: [{ type: "text", text: "Academic Load" }] },
    ]);
    expect(inlineText(parseInline("2 \\* 3 = 6 and a lone * star"))).toBe("2 * 3 = 6 and a lone * star");
    expect(inlineText(parseInline("<script>alert(1)</script>"))).toBe("<script>alert(1)</script>");
  });

  it("keeps lists Word separated with an end-list marker apart", () => {
    const blocks = parseBlocks("1.  **School of Computing**\n\n<!-- end list -->\n\n1.  *Department of Computer Science*\n2.  *Department of Software Engineering*");
    expect(blocks.map((block) => (block.type === "list" ? block.items.length : 0))).toEqual([1, 2]);
  });
});

describe("uploading a new version", () => {
  it("needs a name, a file and real headed sections", () => {
    expect(checkPolicyUpload({ label: "", content: source })).toMatch(/Give the version a name/);
    expect(checkPolicyUpload({ label: "Updated January 15, 2027", content: "" })).toMatch(/Choose the policy file/);
    expect(checkPolicyUpload({ label: "Updated January 15, 2027", content: "# Title\n\nJust text." })).toMatch(/at least 5/);
    expect(checkPolicyUpload({ label: "Updated January 15, 2027", content: source })).toBeNull();
  });
});
