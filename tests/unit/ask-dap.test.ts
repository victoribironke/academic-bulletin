import { describe, expect, it } from "vitest";
import { answerDueBy, isOverdue, questionProblem } from "@/lib/help/ask-dap";
import { DEFAULT_WORKING_WEEK } from "@/lib/calendar/dates";

// Task H6: DAP aims to answer within one working day.
describe("when DAP's answer is due (H6)", () => {
  const calendar = {
    workingWeek: DEFAULT_WORKING_WEEK,
    holidays: ["2026-12-25"],
    breaks: [{ from: "2026-12-24", to: "2027-01-03" }],
  };
  const wat = (local: string) => new Date(`${local}+01:00`);

  it("is the end of the next working day", () => {
    expect(answerDueBy(wat("2026-11-26T10:00:00"), calendar).toISOString()).toBe("2026-11-27T22:59:59.999Z");
    // Friday afternoon: Monday.
    expect(answerDueBy(wat("2026-11-27T16:00:00"), calendar).toISOString()).toBe("2026-11-30T22:59:59.999Z");
    // Just before midnight on Wednesday still counts as Wednesday.
    expect(answerDueBy(wat("2026-12-02T23:30:00"), calendar).toISOString()).toBe("2026-12-03T22:59:59.999Z");
  });

  it("skips the Christmas break", () => {
    expect(answerDueBy(wat("2026-12-23T09:00:00"), calendar).toISOString()).toBe("2027-01-04T22:59:59.999Z");
  });

  it("flags an open question past its time as overdue, never an answered one", () => {
    const now = wat("2026-11-28T09:00:00");
    expect(isOverdue({ status: "OPEN", dueAt: "2026-11-27T22:59:59.999Z" }, now)).toBe(true);
    expect(isOverdue({ status: "ANSWERED", dueAt: "2026-11-27T22:59:59.999Z" }, now)).toBe(false);
    expect(isOverdue({ status: "OPEN", dueAt: "2026-11-30T22:59:59.999Z" }, now)).toBe(false);
  });

  it("checks a question before it is sent", () => {
    expect(questionProblem({ section: "nowhere", question: "What should go here?" })).toMatch(/section/);
    expect(questionProblem({ section: "overview", question: "Why?" })).toMatch(/at least 10/);
    expect(questionProblem({ section: "overview", question: "How long should the philosophy be?" })).toBeNull();
  });
});
