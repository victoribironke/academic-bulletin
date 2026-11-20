// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { sanitizeRichText, unsafeMarkupReason } from "@/lib/html/safe-html";
import { SafeRichText } from "@/components/shared/safe-rich-text";
import { BulletinProgrammeView } from "@/components/preview/bulletin-programme-view";
import type { BulletinProgramme } from "@/lib/bulletin/generation";

afterEach(cleanup);

/** Classic ways stored HTML gets a script to run. */
const ATTACKS = [
  "<script>window.__pwned = 1</script>",
  '<img src=x onerror="window.__pwned=1">',
  '<svg onload="window.__pwned=1"><circle r="1"/></svg>',
  '<a href="javascript:window.__pwned=1">click</a>',
  '<a href="JaVaScRiPt&#58;window.__pwned=1">click</a>',
  '<iframe srcdoc="<script>parent.__pwned=1</script>"></iframe>',
  '<p style="background:url(javascript:alert(1))" onclick="window.__pwned=1">x</p>',
  '<math><mtext><table><mglyph><style><img src=x onerror=window.__pwned=1>',
  '<form action="https://evil.example"><button>Go</button></form>',
  '<object data="data:text/html,<script>parent.__pwned=1</script>"></object>',
];

describe("rich text is cleaned before it is shown", () => {
  it("keeps the editor's formatting", () => {
    const html =
      '<h2>Regulations</h2><p>Students <strong>must</strong> pass <em>every</em> course.</p>' +
      '<ul><li>One</li><li>Two</li></ul><ol start="3"><li>Three</li></ol>' +
      '<p><a href="https://babcock.edu.ng/rules">Rules</a> and <a href="mailto:dap@babcock.edu.ng">email</a></p>';
    const clean = sanitizeRichText(html);
    expect(clean).toContain("<h2>Regulations</h2>");
    expect(clean).toContain("<strong>must</strong>");
    expect(clean).toContain('<ol start="3">');
    expect(clean).toContain('href="https://babcock.edu.ng/rules"');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
    expect(clean).toContain('href="mailto:dap@babcock.edu.ng"');
  });

  it("removes every script, handler, frame and script address", () => {
    for (const attack of ATTACKS) {
      const clean = sanitizeRichText(`<p>Before</p>${attack}<p>After</p>`);
      expect(clean, attack).not.toMatch(/<script|<svg|<math|<iframe|<object|<form|<img|<style/i);
      expect(clean, attack).not.toMatch(/\son[a-z]+=/i);
      expect(clean, attack).not.toMatch(/javascript:|srcdoc|data:text\/html/i);
      // Text before the attack survives; an unclosed tag may swallow what follows.
      expect(clean, attack).toContain("<p>Before</p>");
    }
  });

  it("never runs stored script when the page shows it", () => {
    const win = window as unknown as { __pwned?: number };
    delete win.__pwned;
    for (const attack of ATTACKS) {
      const { container } = render(<SafeRichText html={attack} />);
      for (const link of Array.from(container.querySelectorAll("a"))) link.click();
      container.querySelectorAll("*").forEach((element) => {
        expect(element.getAttributeNames().filter((name) => name.startsWith("on"))).toEqual([]);
      });
    }
    expect(win.__pwned).toBeUndefined();
  });

  it("puts only plain, escaped words in the server-rendered page", () => {
    const html = renderToString(
      <SafeRichText html={'<p>Rule one</p><img src=x onerror="alert(1)"><script>alert(2)</script>'} />,
    );
    expect(html).toContain("Rule one");
    expect(html).not.toMatch(/<img|<script|onerror/i);
  });

  it("shows course content as text, the way the export prints it", () => {
    const programme = {
      id: "p",
      name: "Economics",
      code: "ECO",
      department: "Economics",
      departmentCode: "ECO",
      school: "Social Sciences",
      schoolCode: "SS",
      staff: [],
      courses: [
        {
          code: "ECO 101",
          title: "Principles",
          units: 3,
          description: {
            courseContent: '<img src=x onerror="window.__pwned=1">Supply and demand',
            learningOutcomes: [],
          },
        },
      ],
      content: {
        sectionF: { content: '<p>Pass all courses</p><script>window.__pwned=1</script>' },
      },
    } as unknown as BulletinProgramme;
    const { container } = render(<BulletinProgrammeView programme={programme} />);
    expect(container.innerHTML).toContain("Supply and demand");
    expect(container.innerHTML).toContain("Pass all courses");
    expect(container.querySelector("img[onerror], script")).toBeNull();
  });
});

describe("rich text that could run script is refused on save", () => {
  it("names what is wrong with each attack", () => {
    for (const attack of ATTACKS.filter((a) => !a.includes("&#58;"))) {
      expect(unsafeMarkupReason(attack), attack).not.toBeNull();
    }
  });

  it("accepts what the editor produces, and plain text that merely mentions tags", () => {
    expect(
      unsafeMarkupReason(
        '<h2>Regulations</h2><p>Students <strong>must</strong> attend.</p><ul><li>One</li></ul>' +
          '<p><a href="https://babcock.edu.ng">Babcock</a></p>',
      ),
    ).toBeNull();
    expect(unsafeMarkupReason("<p>Use &lt;script&gt; tags only in CS 201.</p>")).toBeNull();
    expect(unsafeMarkupReason("")).toBeNull();
    expect(unsafeMarkupReason(null)).toBeNull();
  });
});
