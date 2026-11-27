/**
 * Site-wide settings that aren't secret. Change them here and push.
 */

/** The live site address, used in email links. No trailing slash. */
export const SITE_URL = "https://academicplanning.app";

/**
 * Who notification emails come from. The domain must be verified in Resend.
 */
export const EMAIL_FROM =
  "Academic Bulletin <notifications@academicplanning.app>";

/** Claude model used for GRACE and photo checks. */
export const AI_MODEL = "claude-haiku-5-5";

/**
 * Invitations for Heads of Department, programme coordinators and Deans
 * (work order task D3, Appendix C). They go out from the site's verified
 * address under the Directorate's name (DEC7); replies go to
 * INVITATION_REPLY_TO, a Railway variable. The launch session details come
 * from INVITATION_LAUNCH_SESSION, and a general help line from
 * INVITATION_HELP_CONTACT, so DAP can change them without a code change.
 */
export const INVITATIONS = {
  fromName: "Directorate of Academic Planning, Babcock University",
  /** Not before 8:00 am WAT, Thursday, November 26, 2026. */
  sendAt: "2026-11-26T08:00:00+01:00",
  roles: ["HOD", "PROGRAMME_COORDINATOR", "DEAN", "LECTURER", "COMMITTEE_MEMBER"] as const,
};
