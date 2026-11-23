/**
 * The quick start for each role (work order task H1). Each step is a short
 * line in which **bold** words are the exact words on the screens; a test
 * checks every one of them is still on a screen. Pure, so the help panel and
 * the tests share it.
 */
import { approveActionLabel, REQUEST_REVISION_LABEL, STATUS_LABELS } from "@/lib/submissions/phases";

export type QuickStart = { title: string; steps: string[] };

/** The eight sections of a programme draft, in order, as the page names them. */
export const DRAFT_SECTION_TITLES = [
  "Deans & HODs",
  "Staff Directory",
  "Programme Overview",
  "Admission Requirements",
  "Graduation Requirements",
  "Course Structure",
  "Course Details",
  "Regulations & Changes",
] as const;

export const SIGN_IN_STEP =
  "Sign in with Google using your babcock.edu.ng account, then type the six-digit code from your authenticator app. On your own computer or phone, tick **Remember this device for 30 days**.";

const list = (items: readonly string[]) =>
  `${items.slice(0, -1).map((item) => `**${item}**`).join(", ")} and **${items[items.length - 1]}**`;

function departmentSteps(submitOpens: string | null): string[] {
  return [
    "Your **Dashboard** shows **Your deadline** for Departmental Drafting, the next checkpoint and your programmes. Open a programme there or from **Submissions**.",
    `Work through the eight sections in order: ${list(DRAFT_SECTION_TITLES)}.`,
    "Your work saves as you type, and **All changes saved** shows when it has. **Save draft** saves at once.",
    "**Course Structure** starts filled in from the 2023-2027 bulletin: check it level by level. The grey rows with a lock are the General Education block. Every student takes them, and only the General Education desk can change them.",
    `When every section is complete, use **Submit to School**${submitOpens ? ` (it opens on ${submitOpens})` : ""}. Your Dean then reviews the programme at School Board Harmonisation.`,
    `If the Dean sends it back, it shows **${STATUS_LABELS.CORRECTIONS_REQUIRED}**, with the Dean's remarks at the top of the programme.`,
  ];
}

/** The steps for the person's role; `submitOpens` is the date "Submit to School" opens, in words. */
export function quickStartFor(role: string, submitOpens: string | null = null): QuickStart {
  if (role === "HOD") return { title: "Quick start for Heads of Department", steps: departmentSteps(submitOpens) };
  if (role === "PROGRAMME_COORDINATOR") {
    return { title: "Quick start for programme coordinators", steps: departmentSteps(submitOpens) };
  }
  if (role === "DEAN") {
    return {
      title: "Quick start for Deans",
      steps: [
        "Your **Dashboard** shows **Your deadline** for School Board Harmonisation and, under **Action required**, the programmes from your school waiting for you.",
        "Open a programme and read each section. Leave a comment where something needs to change.",
        `When it is ready, use **${approveActionLabel(2)}**. To send it back to the department, use **${REQUEST_REVISION_LABEL}** and say what to change.`,
        `Programmes reach you as departments submit them${submitOpens ? `, from ${submitOpens}` : ""}.`,
      ],
    };
  }
  return {
    title: "Quick start for Academic Planning",
    steps: [
      "Your **Dashboard** shows every programme and the next phase to close. **Action required** lists the programmes at Academic Planning Vetting and after.",
      "On **Users**, see who hasn't signed in yet (**Not signed in yet**), use **Send waiting invitations**, and use **Reset two-step verification** for someone who has lost their phone.",
      `At Academic Planning Vetting, use **${approveActionLabel(3)}** to move a programme on, or **${REQUEST_REVISION_LABEL}** to send it back.`,
      "**Review Cycles**, **Archive** and **Activity Log** hold the cycle and its calendar, archived records, and a record of every action.",
    ],
  };
}

/** Every **bold** label a guide uses, for the test that keeps them true. */
export function quickStartLabels(guide: QuickStart): string[] {
  return [...new Set([...guide.steps, SIGN_IN_STEP].flatMap((step) => [...step.matchAll(/\*\*(.+?)\*\*/g)].map((match) => match[1])))];
}
