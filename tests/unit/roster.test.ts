import { describe, expect, it } from "vitest";
import {
  type RosterPlatform,
  type RosterRow,
  normalizeWhatsapp,
  planRoster,
  splitFullName,
} from "@/lib/people/roster";
import { buildCodeLookup } from "@/lib/units/code-aliases";

// Task D2: importing the roster, dry run first, problems row by row.

const aliases = [
  { kind: "DEPARTMENT", oldCode: "SEH-EDU", newCode: "JSEH-EDU", entityId: "d-edu", validUntil: new Date("2027-02-04T23:59:59+01:00") },
];
const now = new Date("2026-11-24T10:00:00+01:00");
const platform = (users: RosterPlatform["users"] = []): RosterPlatform => ({
  schools: [{ id: "s-jseh", code: "JSEH", name: "Joel Awoniyi School of Education and Humanities" }],
  departments: [{ id: "d-edu", code: "JSEH-EDU", name: "Department of Education", schoolId: "s-jseh" }],
  programmes: [
    { id: "p-cse", code: "JSEH-EDU-CSE", name: "Computer Science Education", departmentId: "d-edu" },
    { id: "p-hed", code: "JSEH-EDU-HED", name: "Health Education", departmentId: "d-edu" },
  ],
  users,
  lookups: {
    school: buildCodeLookup("SCHOOL", [{ id: "s-jseh", code: "JSEH" }], [], now),
    department: buildCodeLookup("DEPARTMENT", [{ id: "d-edu", code: "JSEH-EDU" }], aliases, now),
    programme: buildCodeLookup(
      "PROGRAMME",
      [
        { id: "p-cse", code: "JSEH-EDU-CSE" },
        { id: "p-hed", code: "JSEH-EDU-HED" },
      ],
      [],
      now,
    ),
  },
});
const row = (overrides: Partial<RosterRow>): RosterRow => ({
  sheet: "Heads of Department",
  rowNumber: 2,
  unitCode: "JSEH-EDU",
  title: "Dr.",
  fullName: "Ngozi Adaeze Eze",
  email: "n.eze@babcock.edu.ng",
  acting: "No",
  whatsapp: "",
  ...overrides,
});

describe("reading names and numbers", () => {
  it("splits full names, with or without a comma", () => {
    expect(splitFullName("Ngozi Adaeze Eze")).toEqual({ firstName: "Ngozi Adaeze", lastName: "Eze" });
    expect(splitFullName("Okafor, Adaeze Grace")).toEqual({ firstName: "Adaeze Grace", lastName: "Okafor" });
    expect(splitFullName("Okafor")).toBeNull();
  });

  it("writes WhatsApp numbers in one form", () => {
    expect(normalizeWhatsapp("0803 123 4567")).toBe("+2348031234567");
    expect(normalizeWhatsapp("+234 (803) 123-4567")).toBe("+2348031234567");
    expect(normalizeWhatsapp("")).toBeNull();
    expect(normalizeWhatsapp("12345")).toBeUndefined();
  });
});

describe("planning the import (D2)", () => {
  it("links a Head to the department, and its school, by code", () => {
    const plan = planRoster([row({})], platform());
    expect(plan.problems).toEqual([]);
    expect(plan.people[0]).toMatchObject({
      role: "HOD",
      departmentId: "d-edu",
      schoolId: "s-jseh",
      firstName: "Ngozi Adaeze",
      lastName: "Eze",
      action: "create",
    });
  });

  it("accepts an old code with a warning naming the new one", () => {
    const plan = planRoster([row({ unitCode: "SEH-EDU" })], platform());
    expect(plan.people[0].warnings.join(" ")).toMatch(/now JSEH-EDU/);
  });

  it("reports every problem by sheet and row, and imports nobody", () => {
    const plan = planRoster(
      [
        row({ rowNumber: 2, email: "n.eze@gmail.com" }),
        row({ rowNumber: 3, unitCode: "XXX-YYY", email: "x@babcock.edu.ng" }),
        row({ rowNumber: 4, email: "twice@babcock.edu.ng" }),
        row({ sheet: "Deans", rowNumber: 5, unitCode: "JSEH", email: "twice@babcock.edu.ng" }),
        row({ rowNumber: 6, email: "phone@babcock.edu.ng", whatsapp: "12345" }),
        row({ rowNumber: 7, email: "nameless@babcock.edu.ng", fullName: "Eze" }),
      ],
      platform(),
    );
    const messages = plan.problems.map((problem) => `${problem.sheet} ${problem.rowNumber}: ${problem.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Heads of Department 2: .*not a babcock\.edu\.ng address/),
        expect.stringMatching(/Heads of Department 3: No unit has the code XXX-YYY/),
        expect.stringMatching(/Heads of Department 4: twice@babcock\.edu\.ng is listed 2 times/),
        expect.stringMatching(/Deans 5: twice@babcock\.edu\.ng is listed 2 times/),
        expect.stringMatching(/Heads of Department 6: "12345" is not a phone number/),
        expect.stringMatching(/Heads of Department 7: Give the full name/),
      ]),
    );
    expect(plan.people).toEqual([]);
  });

  it("skips the template's unfilled lines", () => {
    const plan = planRoster([row({ fullName: "", email: "" }), row({ rowNumber: 3 })], platform());
    expect(plan.blankRows).toBe(1);
    expect(plan.people).toHaveLength(1);
  });

  it("joins a coordinator listed for two programmes of one department", () => {
    const coordinator = { sheet: "Programme coordinators" as const, email: "c.obi@babcock.edu.ng", fullName: "Chidi Obi" };
    const plan = planRoster(
      [row({ ...coordinator, rowNumber: 2, unitCode: "JSEH-EDU-CSE" }), row({ ...coordinator, rowNumber: 3, unitCode: "JSEH-EDU-HED" })],
      platform(),
    );
    expect(plan.problems).toEqual([]);
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0]).toMatchObject({ role: "PROGRAMME_COORDINATOR", departmentId: "d-edu", programmeIds: ["p-cse", "p-hed"] });
  });

  it("updates someone already there, and never touches a Super Administrator", () => {
    const existing = {
      id: "u1",
      email: "n.eze@babcock.edu.ng",
      firstName: "Ngozi Adaeze",
      lastName: "Eze",
      role: "DEAN" as const,
      isActive: true,
      title: "Dr.",
      whatsapp: null,
      isActing: false,
      schoolId: "s-jseh",
      departmentId: null,
      programmeIds: [],
    };
    const update = planRoster([row({})], platform([existing]));
    expect(update.people[0]).toMatchObject({ action: "update", existingUserId: "u1" });
    expect(update.people[0].changes).toEqual(expect.arrayContaining(["role DEAN to HOD", "department"]));

    const superAdmin = planRoster([row({})], platform([{ ...existing, role: "SUPER_ADMIN" }]));
    expect(superAdmin.people).toEqual([]);
    expect(superAdmin.problems[0].message).toMatch(/Super Administrator/);
  });
});
