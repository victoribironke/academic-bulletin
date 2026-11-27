import { describe, expect, it } from "vitest";
import { handlePracticeRequest, type PracticeViewer } from "@/lib/practice/handlers";
import { startingPracticeState, type PracticeState } from "@/lib/practice/fixture";
import { PRACTICE_IDS, mentionsPractice } from "@/lib/practice/ids";

// Task U6: the practice programme answers the draft screen's requests in the
// browser, with the real rules, and sends nothing anywhere.

const head: PracticeViewer = { id: "user-head", role: "HOD", firstName: "Ada", lastName: "Head" };
const coordinator: PracticeViewer = { id: "user-coord", role: "PROGRAMME_COORDINATOR", firstName: "Bo", lastName: "Coord" };
const dean: PracticeViewer = { id: "user-dean", role: "DEAN", firstName: "Cy", lastName: "Dean" };

function call(state: PracticeState, viewer: PracticeViewer, method: string, path: string, body?: unknown) {
  return handlePracticeRequest(state, viewer, {
    method,
    url: new URL(path, "https://academicplanning.app"),
    body: body === undefined ? null : JSON.stringify(body),
    hasFile: false,
  });
}

const draft = `/api/submissions/${PRACTICE_IDS.draft}`;

describe("practice programme (U6)", () => {
  it("answers only requests that name a practice record", () => {
    expect(mentionsPractice(draft, null)).toBe(true);
    expect(mentionsPractice("/api/courses", JSON.stringify({ submissionId: PRACTICE_IDS.draft }))).toBe(true);
    expect(mentionsPractice("/api/submissions/abc123", JSON.stringify({ content: { vision: "best practice-led teaching" } }))).toBe(false);
  });

  it("opens a half-drafted programme the Head can edit and submit", () => {
    const state = startingPracticeState("HOD");
    const res = call(state, head, "GET", draft);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: PRACTICE_IDS.draft,
      currentPhase: 1,
      status: "DRAFT",
      programme: { name: "B.Sc. (Hons.) Practice Studies", duration: 4 },
      workflow: { actions: ["SUBMIT"], canEdit: true },
    });
  });

  it("saves sections and course changes in the practice only", () => {
    let state = startingPracticeState("HOD");
    const saved = call(state, head, "PUT", draft, { content: { mission: "To serve." } });
    expect(saved.changed).toBe(true);
    state = saved.state;
    expect(state.content.mission).toBe("To serve.");

    const added = call(state, head, "POST", "/api/courses", { submissionId: PRACTICE_IDS.draft, code: "prs 205", title: "Field Notes", units: 2, level: 200, semester: 1 });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ code: "PRS 205", isGeneralEducation: false });
    state = added.state;
    const id = (added.body as { id: string }).id;
    expect(call(state, head, "POST", "/api/courses", { submissionId: PRACTICE_IDS.draft, code: "PRS 205", title: "Again", units: 2, level: 200, semester: 1 }).status).toBe(409);

    state = call(state, head, "PATCH", `/api/courses/${id}`, { units: 3 }).state;
    const list = call(state, head, "GET", `/api/courses?submissionId=${PRACTICE_IDS.draft}`).body as { code: string; units: number }[];
    expect(list.find((course) => course.code === "PRS 205")?.units).toBe(3);

    state = call(state, head, "DELETE", "/api/courses/bulk", { submissionId: PRACTICE_IDS.draft, ids: [id], confirm: "DELETE" }).state;
    expect(state.courses.some((course) => course.id === id)).toBe(false);
  });

  it("shows the readiness checks and the credit numbers, and keeps nothing it can't (F2, W4, W5)", () => {
    const state = startingPracticeState("HOD");
    const checks = call(state, head, "GET", `${draft}/checks`);
    expect(checks.status).toBe(200);
    const body = checks.body as { ready: boolean; counts: { mustFix: number }; results: { rule: string; accepted: null }[] };
    // A half-drafted programme: things to fix, never GRACE (real programmes only).
    expect(body.ready).toBe(false);
    expect(body.counts.mustFix).toBeGreaterThan(0);
    expect(body.results.some((result) => result.rule === "V12")).toBe(false);
    expect(call(state, head, "POST", `${draft}/checks`, { key: "V3", reason: "A reason long enough" }).status).toBe(409);

    const credits = call(state, head, "GET", `${draft}/credit-summary`).body as { totals: { total: number; generalEducation: number }; graduationText: string };
    expect(credits.totals.total).toBe(state.courses.reduce((sum, course) => sum + course.units, 0));
    expect(credits.totals.generalEducation).toBeGreaterThan(0);
    expect(credits.graduationText).toMatch(/^To graduate, a student must earn at least \d+ credits/);
    expect(call(state, head, "GET", `${draft}/elective-groups`).body).toEqual({ groups: [] });
    expect(call(state, head, "POST", `${draft}/elective-groups`, { name: "Options", chooseUnits: 3 }).status).toBe(409);
  });

  it("keeps the General Education block locked, as on a real draft", () => {
    const state = startingPracticeState("HOD");
    const general = state.courses.find((course) => course.isGeneralEducation)!;
    expect(call(state, head, "PATCH", `/api/courses/${general.id}`, { units: 9 }).status).toBe(403);
    expect(call(state, head, "DELETE", `/api/courses/${general.id}`, { confirm: "DELETE" }).status).toBe(403);
    // The table sends every row on save: an unchanged row is fine.
    expect(call(state, head, "PATCH", `/api/courses/${general.id}`, { units: general.units }).status).toBe(200);
  });

  it("submits to the Dean in the practice, and says nothing was sent", () => {
    const state = startingPracticeState("HOD");
    const res = call(state, head, "POST", `${draft}/transition`, { action: "SUBMIT" });
    expect(res.status).toBe(200);
    expect(res.state.submission).toMatchObject({ currentPhase: 2, status: "IN_REVIEW" });
    expect(res.state.transitions[0]).toMatchObject({ fromPhase: 1, toPhase: 2, action: "SUBMIT", performedBy: { firstName: "Ada" } });
    expect((res.body as { practiceNote: string }).practiceNote).toMatch(/nothing was sent/);
    // Now with the Dean: the Head can recall it but not edit it.
    expect(call(res.state, head, "GET", draft).body).toMatchObject({ workflow: { actions: ["RECALL"], canEdit: false } });
  });

  it("lets a coordinator draft but not submit", () => {
    const state = startingPracticeState("PROGRAMME_COORDINATOR");
    expect(call(state, coordinator, "GET", draft).body).toMatchObject({ workflow: { actions: [], canEdit: true } });
    expect(call(state, coordinator, "POST", `${draft}/transition`, { action: "SUBMIT" }).status).toBe(403);
  });

  it("starts a Dean at School Board Harmonisation, with the review actions", () => {
    const state = startingPracticeState("DEAN");
    expect(call(state, dean, "GET", draft).body).toMatchObject({
      currentPhase: 2,
      status: "IN_REVIEW",
      workflow: { actions: ["APPROVE", "RETURN"] },
      phaseTransitions: [{ fromPhase: 1, toPhase: 2, performedBy: { firstName: "Sample", lastName: "Head" } }],
    });
    const commented = call(state, dean, "POST", `${draft}/comments`, { content: "Add the mission.", section: "overview", type: "ISSUE" });
    expect(commented.status).toBe(201);
    expect(commented.state.comments).toHaveLength(1);
  });

  it("refuses files and anything outside the practice, changing nothing", () => {
    const state = startingPracticeState("HOD");
    const upload = handlePracticeRequest(state, head, { method: "POST", url: new URL(`${draft}/image`, "https://x.test"), body: null, hasFile: true });
    expect(upload).toMatchObject({ status: 400, changed: false });
    const elsewhere = call(state, head, "POST", "/api/dap-questions", { question: "Hello" });
    expect(elsewhere).toMatchObject({ status: 409, changed: false });
  });
});

describe("practice programme and the real Course Registry (U6)", () => {
  it("searches the real Registry without the practice ids, read-only", () => {
    const state = startingPracticeState("HOD");
    const res = call(state, head, "GET", `/api/master-courses?departmentId=${PRACTICE_IDS.department}&page=1&q=ecology&submissionId=${PRACTICE_IDS.draft}`);
    expect(res.forward).toBe("/api/master-courses?page=1&q=ecology");
    expect(res.changed).toBe(false);
  });
});

describe("practice programme answers in the real shapes (U6)", () => {
  it("marks sections with the real progress rules", () => {
    const state = startingPracticeState("HOD");
    const res = call(state, head, "GET", `${draft}/sections`);
    const body = res.body as { percentage: number; marks: Record<string, { state: string }> };
    expect(typeof body.percentage).toBe("number");
    expect(Object.keys(body.marks)).toEqual(expect.arrayContaining(["overview", "courses", "staff"]));
    expect(body.marks.courses.state).toBe("check"); // the list isn't confirmed yet
  });

  it("asks DAP in the practice: listed, but sent to no one", () => {
    let state = startingPracticeState("HOD");
    expect(call(state, head, "POST", `${draft}/questions`, { section: "overview", question: "Too short" }).status).toBe(400);
    const asked = call(state, head, "POST", `${draft}/questions`, { section: "overview", field: null, question: "Which vision wording do we use?" });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ status: "OPEN", officer: expect.stringMatching(/not sent/) });
    state = asked.state;
    expect(call(state, head, "GET", `${draft}/questions`).body).toHaveLength(1);
  });

  it("confirms the course list, and notices a change after", () => {
    let state = startingPracticeState("HOD");
    expect(call(state, head, "GET", `${draft}/course-list`).body).toEqual({ confirmation: null, requests: [] });
    state = call(state, head, "POST", `${draft}/course-list`).state;
    expect(call(state, head, "GET", `${draft}/course-list`).body).toMatchObject({ confirmation: { changedSince: false } });
    const own = state.courses.find((course) => !course.isGeneralEducation)!;
    state = call(state, head, "PATCH", `/api/courses/${own.id}`, { units: 4 }).state;
    expect(call(state, head, "GET", `${draft}/course-list`).body).toMatchObject({ confirmation: { changedSince: true } });
    expect(call(state, coordinator, "POST", `${draft}/course-list`).status).toBe(403);
  });

  it("keeps staff in the real columns, and removing a photo keeps the person", () => {
    let state = startingPracticeState("HOD");
    const list = call(state, head, "GET", `/api/staff?departmentId=${PRACTICE_IDS.department}`).body as { id: string; surname: string; fullName: string }[];
    expect(list[0]).toMatchObject({ surname: "Lecturer", fullName: expect.stringContaining("Lecturer") });
    const added = call(state, head, "POST", "/api/staff", { departmentId: PRACTICE_IDS.department, title: "MR", firstName: "Tunde", surname: "Practice", academicRank: "LECTURER_II", type: "ACADEMIC" });
    expect(added.status).toBe(201);
    state = added.state;
    const id = (added.body as { id: string }).id;
    state = call(state, head, "DELETE", `/api/staff/${id}/image`, { confirm: "DELETE" }).state;
    expect(state.staff.some((member) => member.id === id)).toBe(true);
    state = call(state, head, "DELETE", `/api/staff/${id}`, { confirm: "DELETE" }).state;
    expect(state.staff.some((member) => member.id === id)).toBe(false);
  });

  it("hides the countdown and previews the practice programme", () => {
    const state = startingPracticeState("HOD");
    expect(call(state, head, "GET", `/api/calendar/desk?submissionId=${PRACTICE_IDS.draft}`).body).toEqual({ cycle: null });
    const preview = call(state, head, "GET", `/api/bulletin/generate?level=department&programmeId=${PRACTICE_IDS.programme}&submissionId=${PRACTICE_IDS.draft}`).body as {
      programmes: { name: string; courses: unknown[]; staff: { rank: string }[] }[];
    };
    expect(preview.programmes[0]).toMatchObject({ name: "B.Sc. (Hons.) Practice Studies" });
    expect(preview.programmes[0].staff[0].rank).not.toBe("");
    expect(call(state, head, "GET", `/api/bulletin/export?submissionId=${PRACTICE_IDS.draft}&format=pdf`).status).toBe(409);
  });
});
