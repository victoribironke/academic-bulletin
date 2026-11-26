/**
 * Task U6: a three-step welcome on first sign-in, skippable, for the people
 * who draft and review programmes. In the words of the screens.
 */
export type TourStep = { title: string; body: string };

const HELP_STEP: TourStep = {
  title: "Help is on every screen",
  body:
    "Help (top right) has the quick start for your role. Under each field you'll see what good looks like. Ask DAP sends a question about any section to your school's DAP officer, and the clinics on your home page are open twice a week.",
};

export function welcomeTourFor(role: string | null | undefined): TourStep[] | null {
  if (role === "HOD" || role === "PROGRAMME_COORDINATOR") {
    return [
      {
        title: "Your home page",
        body:
          "Your deadline and the next checkpoint are at the top, with each of your programmes and how far along it is. What is waiting on you and Do this next tell you where to start.",
      },
      {
        title: "Your drafts",
        body:
          "Each programme has eight sections, worked in order; your work saves as you type. Course Structure starts filled in from the 2023-2027 bulletin: check it, then confirm the course list." +
          (role === "HOD" ? " Only you submit; you can name a programme coordinator to help draft." : " Only your Head of Department submits."),
      },
      HELP_STEP,
    ];
  }
  if (role === "DEAN") {
    return [
      { title: "Your home page", body: "Your deadline for School Board Harmonisation is at the top, with every programme in your school and where it stands." },
      {
        title: "Reviewing a programme",
        body: "Programmes reach you as departments submit them. Open one, read each section, leave comments where something should change, then approve it or request a revision with your reasons.",
      },
      HELP_STEP,
    ];
  }
  return null;
}

export const WELCOME_SEEN_KEY = (userId: string) => `abrs-welcome-seen:${userId}`;
export const OPEN_WELCOME_EVENT = "abrs:open-welcome";
