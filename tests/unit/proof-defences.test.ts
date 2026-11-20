import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "@/lib/request-origin";
import { staffRankLabel } from "@/lib/validation/name-format";
import { validateBulletinProgramme } from "@/lib/bulletin/validation";
import { philosophyNamesOtherProgramme } from "@/lib/submissions/submit-readiness";
import type { BulletinProgramme } from "@/lib/bulletin/generation";

const SITE = "https://academicplanning.app";
const hosts = ["academicplanning.app"];

describe("API writes from other sites are refused (CSRF)", () => {
  it("refuses a write a browser sends from another site", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        isCrossSiteWrite({ method, origin: "https://evil.example", secFetchSite: "cross-site", hosts, siteUrl: SITE }),
      ).toBe(true);
    }
    // No Origin, but the browser says it came from another site.
    expect(isCrossSiteWrite({ method: "POST", origin: null, secFetchSite: "cross-site", hosts, siteUrl: SITE })).toBe(true);
    // Sandboxed frames and some redirects send "null".
    expect(isCrossSiteWrite({ method: "POST", origin: "null", secFetchSite: null, hosts, siteUrl: SITE })).toBe(true);
    // A look-alike host is not this site.
    expect(
      isCrossSiteWrite({ method: "POST", origin: "https://academicplanning.app.evil.example", secFetchSite: null, hosts, siteUrl: SITE }),
    ).toBe(true);
  });

  it("lets this site's own pages, reads and non-browser callers through", () => {
    expect(isCrossSiteWrite({ method: "POST", origin: SITE, secFetchSite: "same-origin", hosts, siteUrl: SITE })).toBe(false);
    // Reached through Railway's own address: the request's host is the origin.
    expect(
      isCrossSiteWrite({
        method: "PUT",
        origin: "https://academic-bulletin-production.up.railway.app",
        secFetchSite: "same-origin",
        hosts: [null, "academic-bulletin-production.up.railway.app"],
        siteUrl: SITE,
      }),
    ).toBe(false);
    expect(isCrossSiteWrite({ method: "GET", origin: "https://evil.example", secFetchSite: "cross-site", hosts, siteUrl: SITE })).toBe(false);
    expect(isCrossSiteWrite({ method: "POST", origin: null, secFetchSite: null, hosts, siteUrl: SITE })).toBe(false);
    expect(isCrossSiteWrite({ method: "POST", origin: "http://localhost:3000", secFetchSite: "same-origin", hosts: ["localhost:3000"], siteUrl: SITE })).toBe(false);
  });
});

const programme = (overrides: Partial<BulletinProgramme> = {}): BulletinProgramme =>
  ({
    id: "p",
    name: "Law",
    code: "LAW",
    department: "Law",
    departmentCode: "LAW",
    school: "Law and Security Studies",
    schoolCode: "LSS",
    courses: [],
    staff: [],
    ...overrides,
  }) as BulletinProgramme;

describe("rank Other prints a job title and is refused without one", () => {
  it("prints the job title for rank Other, never the word", () => {
    expect(staffRankLabel({ academicRank: "OTHER", customJobTitle: " Chief Technologist " })).toBe("Chief Technologist");
    expect(staffRankLabel({ academicRank: "OTHER", customJobTitle: null })).toBe("");
    expect(staffRankLabel({ academicRank: "SENIOR_LECTURER", customJobTitle: "ignored" })).not.toBe("ignored");
  });

  it("refuses a bulletin listing staff with rank Other and no job title", () => {
    const member = (fullName: string, rank: string) => ({
      id: fullName, fullName, title: "Mr", rank, qualification: "LLM", type: "ACADEMIC",
    });
    const issues = validateBulletinProgramme(
      programme({ staff: [member("Ada Obi", ""), member("Bola Ade", "Lecturer I"), member("Chi Eze", " ")] }),
    );
    const missing = issues.find((issue) => issue.code === "STAFF_RANK_MISSING");
    expect(missing).toMatchObject({ severity: "error" });
    expect(missing?.message).toContain("Ada Obi");
    expect(missing?.message).toContain("Chi Eze");
    expect(missing?.message).not.toContain("Bola Ade");

    const ranked = validateBulletinProgramme(programme({ staff: [member("Bola Ade", "Lecturer I")] }));
    expect(ranked.map((issue) => issue.code)).not.toContain("STAFF_RANK_MISSING");
  });
});

describe("a philosophy written for another programme is caught", () => {
  const names = [
    "Nursing Science", "Law", "Economics", "Accounting", "Information Technology",
    "Agricultural Economics and Agricultural Extension", "Public Health", "Computer Science",
  ];
  const others = (own: string) => names.filter((name) => name !== own);

  it("catches one that names another programme and not its own", () => {
    expect(
      philosophyNamesOtherProgramme(
        "The Accounting programme trains professional accountants for audit practice.",
        "Economics",
        others("Economics"),
      ),
    ).toBe("Accounting");
  });

  it("isn't fooled by a word two programme names share", () => {
    const withEngineering = [...names, "Agricultural Engineering"];
    const own = "Agricultural Economics and Agricultural Extension";
    expect(
      philosophyNamesOtherProgramme(
        "Agricultural Engineering designs machines for agricultural production.",
        own,
        withEngineering.filter((name) => name !== own),
      ),
    ).toBe("Agricultural Engineering");
    expect(
      philosophyNamesOtherProgramme(
        "Agricultural Engineering at Babcock works with agricultural economics experts.",
        "Agricultural Engineering",
        withEngineering.filter((name) => name !== "Agricultural Engineering"),
      ),
    ).toBeNull();
  });

  it("passes the test records' real philosophies and honest mentions", () => {
    // Shapes of the Nursing Science, Law and Economics philosophies on the live site.
    expect(philosophyNamesOtherProgramme("The Nursing Programme of Babcock University is founded on care.", "Nursing Science", others("Nursing Science"))).toBeNull();
    expect(philosophyNamesOtherProgramme("The Department of Law teaches emerging areas of law, including information technology.", "Law", others("Law"))).toBeNull();
    expect(philosophyNamesOtherProgramme("The Department of Economics equips students with analytical tools.", "Economics", others("Economics"))).toBeNull();
    // The programme's own field inside a longer name is not another programme.
    expect(philosophyNamesOtherProgramme("Grounded in economics, the programme serves farmers.", "Agricultural Economics and Agricultural Extension", others("Agricultural Economics and Agricultural Extension"))).toBeNull();
    expect(philosophyNamesOtherProgramme("", "Law", others("Law"))).toBeNull();
  });
});
