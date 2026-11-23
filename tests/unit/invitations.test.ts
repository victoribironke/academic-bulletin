import { describe, expect, it } from "vitest";
import { invitationEmail } from "@/lib/people/invitations";
import { senderFor, testSiteEmail } from "@/lib/email/resend";
import { buildCountdown } from "@/lib/calendar/countdown";

// Task D3: the invitation email.

const deadline = buildCountdown({
  label: "Departmental Drafting",
  dueDate: "2027-02-04",
  calendar: { workingWeek: ["MON", "TUE", "WED", "THU", "FRI"], holidays: [], breaks: [] },
  now: new Date("2026-11-26T08:00:00+01:00"),
});
const person = {
  email: "n.eze@babcock.edu.ng",
  title: "Dr.",
  firstName: "Ngozi",
  lastName: "Eze",
  role: "HOD" as const,
  isActing: true,
  unit: "Department of Human Nutrition and Dietetics",
};

describe("the invitation (D3)", () => {
  const email = invitationEmail(person, {
    siteUrl: "https://academicplanning.app",
    deadline,
    launchSession: "Thursday, November 26, 2026, 10:00 am, Senate Chamber and online",
    helpContact: { name: "Mrs. Officer One", email: "officer.one@babcock.edu.ng", whatsapp: "+2348030000000" },
    replyTo: "deputy.director@babcock.edu.ng",
  });

  it("greets the person, names their role and unit, and gives their deadline", () => {
    expect(email.to).toEqual(["n.eze@babcock.edu.ng"]);
    expect(email.subject).toBe("Your Academic Bulletin desk is ready");
    expect(email.text).toContain("Dear Dr. Eze,");
    expect(email.text).toContain("as Acting Head of Department, Department of Human Nutrition and Dietetics");
    expect(email.text).toContain(
      "Your deadline: Departmental Drafting: due Thursday, February 4, 2027, 11:59 pm (70 days left)",
    );
  });

  it("says when the launch session is and who to contact", () => {
    expect(email.text).toContain("Launch session: Thursday, November 26, 2026, 10:00 am");
    expect(email.text).toContain("Help: Mrs. Officer One, officer.one@babcock.edu.ng, WhatsApp +2348030000000");
  });

  it("links straight to the home page and walks through the authenticator", () => {
    expect(email.text).toContain("Open your desk: https://academicplanning.app/dashboard");
    expect(email.text).toContain('tick "Remember this device for 30 days"');
    expect(email.html).toContain('href="https://academicplanning.app/dashboard"');
  });

  it("comes from the Directorate, with replies to the Deputy Director (DEC7)", () => {
    expect(email.fromName).toBe("Directorate of Academic Planning, Babcock University");
    expect(senderFor(email.fromName)).toBe(
      "Directorate of Academic Planning, Babcock University <notifications@academicplanning.app>",
    );
    expect(email.replyTo).toEqual(["deputy.director@babcock.edu.ng"]);
  });

  it("leaves out what isn't known yet, and escapes names in the HTML", () => {
    const plain = invitationEmail({ ...person, title: null, isActing: false, lastName: "O'Brien <x>" }, {
      siteUrl: "https://academicplanning.app",
      deadline: null,
    });
    expect(plain.text).toContain("Dear Ngozi O'Brien <x>,");
    expect(plain.text).not.toContain("Launch session");
    expect(plain.text).not.toContain("Your deadline");
    expect(plain.html).not.toContain("<x>");
    expect(plain.replyTo).toBeUndefined();
  });

  it("on the test site keeps the sender name and reply-to but goes only to the test inbox", () => {
    const redirected = testSiteEmail(email, "dap.test@babcock.edu.ng")!;
    expect(redirected.to).toEqual(["dap.test@babcock.edu.ng"]);
    expect(redirected.subject).toBe("[TEST SITE] Your Academic Bulletin desk is ready");
    expect(redirected.fromName).toBe(email.fromName);
  });
});
