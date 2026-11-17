import { describe, expect, it } from "vitest";
import { bulletinFingerprint, type LedgerCourse } from "@/lib/submissions/ledger";

const course = (code: string, courseContent: string): LedgerCourse => ({
  code,
  title: `${code} title`,
  units: 3,
  status: "CORE",
  semester: 1,
  level: 100,
  prerequisites: null,
  description: {
    learningOutcomes: ["Explain the ideas"],
    courseContent,
    labWork: null,
    entrepreneurialAspect: null,
  },
});

const content = {
  id: "content-1",
  submissionId: "submission-1",
  philosophy: "Faith and learning.",
  mission: "To serve.",
  minimumCGPA: 2.5,
  objectives: ["One", "Two"],
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  philosophyGracePass: false,
  philosophyGrace: null,
};

describe("bulletin fingerprint", () => {
  const base = bulletinFingerprint(content, [course("NSC 101", "A"), course("NSC 102", "B")]);

  it("is the same for the same text, whatever the order", () => {
    const reordered = {
      objectives: ["One", "Two"],
      minimumCGPA: 2.5,
      mission: "To serve.",
      philosophy: "Faith and learning.",
    };
    expect(
      bulletinFingerprint(reordered, [course("NSC 102", "B"), course("NSC 101", "A")]),
    ).toBe(base);
  });

  it("ignores checks and bookkeeping", () => {
    expect(
      bulletinFingerprint(
        {
          ...content,
          id: "other",
          updatedAt: new Date(),
          philosophyGracePass: true,
          philosophyGrace: { passed: true },
        },
        [course("NSC 101", "A"), course("NSC 102", "B")],
      ),
    ).toBe(base);
  });

  it("changes when any text changes", () => {
    expect(
      bulletinFingerprint({ ...content, mission: "To lead." }, [
        course("NSC 101", "A"),
        course("NSC 102", "B"),
      ]),
    ).not.toBe(base);
    expect(
      bulletinFingerprint(content, [course("NSC 101", "A"), course("NSC 102", "B changed")]),
    ).not.toBe(base);
    expect(bulletinFingerprint(content, [course("NSC 101", "A")])).not.toBe(base);
    // A list's order is part of its text.
    expect(
      bulletinFingerprint({ ...content, objectives: ["Two", "One"] }, [
        course("NSC 101", "A"),
        course("NSC 102", "B"),
      ]),
    ).not.toBe(base);
  });
});
