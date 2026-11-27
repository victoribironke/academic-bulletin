/**
 * Task E4: the Dean's title, name and photo are kept once on the school, and
 * the Head of Department's on the department, so changing a photo once
 * updates every programme there. A programme's own earlier photo (saved on
 * the draft before E4) is used only while the record has none.
 * Task Q4: the line printed under each photo.
 */
export type Leader = { title: string | null; name: string | null; imageUrl: string | null };
export type Leaders = { dean: Leader; hod: Leader };
export type LeaderRole = keyof Leaders;

export const LEADER_ROLE_LABEL: Record<LeaderRole, string> = { dean: "Dean", hod: "Head of Department" };

/** Suggestions for the title box; any short title can be typed. */
export const LEADER_TITLES = ["Prof.", "Dr.", "Pastor", "Engr.", "Mr.", "Mrs.", "Ms."];

export const MAX_LEADER_TITLE = 40;
export const MAX_LEADER_NAME = 120;

const clean = (value: string | null | undefined) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
};

export function resolveLeaders(
  school: { deanTitle?: string | null; deanName?: string | null; deanImageUrl?: string | null } | null | undefined,
  department: { hodTitle?: string | null; hodName?: string | null; hodImageUrl?: string | null } | null | undefined,
  programmeInfo: unknown,
): Leaders {
  const info = (programmeInfo ?? {}) as { deanImageUrl?: string; hodImageUrl?: string };
  return {
    dean: {
      title: clean(school?.deanTitle),
      name: clean(school?.deanName),
      imageUrl: clean(school?.deanImageUrl) ?? clean(info.deanImageUrl),
    },
    hod: {
      title: clean(department?.hodTitle),
      name: clean(department?.hodName),
      imageUrl: clean(department?.hodImageUrl) ?? clean(info.hodImageUrl),
    },
  };
}

/** Q4: "Prof. Jane Doe" (or nothing yet). */
export function leaderName(leader: Leader): string | null {
  const name = [leader.title, leader.name].filter(Boolean).join(" ");
  return leader.name ? name : null;
}

/** V6: what is still missing, in words, e.g. "the Dean's title and photo". */
export function leaderGaps(leaders: Leaders): string[] {
  const gaps: string[] = [];
  for (const role of ["dean", "hod"] as const) {
    const leader = leaders[role];
    const missing = [!leader.title && "title", !leader.name && "name", !leader.imageUrl && "photo"].filter(Boolean) as string[];
    if (missing.length === 0) continue;
    const words = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
    gaps.push(`the ${LEADER_ROLE_LABEL[role]}'s ${words}`);
  }
  return gaps;
}
