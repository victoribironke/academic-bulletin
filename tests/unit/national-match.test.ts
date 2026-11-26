import { describe, expect, it } from "vitest";
import catalogue from "@/data/ccmas/catalogue.json";
import sources from "@/data/ccmas/sources.json";
import {
  NATIONAL_MATCHES,
  approvedNationalLinks,
  nationalMatchCounts,
  nationalMatchFor,
  nationalMatchText,
  nationalMatchesApproved,
} from "@/lib/courses/national-match";
import optionFamilies from "@/data/programmes/option-families.json";

// Task B1: every programme matched to the national curriculum it follows,
// or to its NUC document when the national programme isn't known.

const nationalNames = new Set(
  (catalogue as { courses: { variants: { sourceProgramme: string }[] }[] }).courses.flatMap((course) =>
    course.variants.map((variant) => variant.sourceProgramme),
  ),
);

describe("programmes matched to the national curriculum (B1)", () => {
  it("covers every programme in the code standard once", () => {
    expect(NATIONAL_MATCHES).toHaveLength(68);
    expect(new Set(NATIONAL_MATCHES.map((match) => match.code)).size).toBe(68);
    expect(nationalMatchCounts()).toEqual({ total: 68, SAME_NAME: 35, PROPOSED: 27, DISCIPLINE_ONLY: 6 });
  });

  it("uses only national programmes and NUC documents that exist", () => {
    const disciplines = new Set((sources as { name: string }[]).map((source) => source.name));
    for (const match of NATIONAL_MATCHES) {
      expect(disciplines.has(match.discipline), match.code).toBe(true);
      for (const name of match.national) expect(nationalNames.has(name), `${match.code}: ${name}`).toBe(true);
      expect(match.national.length === 0, match.code).toBe(match.status === "DISCIPLINE_ONLY");
    }
  });

  it("links nothing new until DAP approves the list", () => {
    expect(nationalMatchesApproved()).toBeNull();
    expect(approvedNationalLinks().size).toBe(0);
  });

  it("matches the B.Agric. options to their national programmes", () => {
    for (const programme of optionFamilies.families.flatMap((family) => family.programmes)) {
      expect(nationalMatchFor(programme.code), programme.code).not.toBeNull();
    }
    expect(nationalMatchFor("SSAT-AIT-AGE")?.national).toEqual(["Agricultural Economics", "Agricultural Extension"]);
    expect(nationalMatchText(nationalMatchFor("ssat-ait-ans")!)).toBe("Animal Science (Agriculture)");
    expect(nationalMatchText(nationalMatchFor("JSEH-EDU-BED")!)).toBe("Education document (it lists its programmes together)");
    expect(nationalMatchText(nationalMatchFor("SNSC-NRS-NRS")!)).toBe("Allied Health Sciences document; the national programme is for DAP to name");
  });
});
