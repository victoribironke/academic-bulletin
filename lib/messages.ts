/**
 * Tasks U7 and U1: plain, helpful words, kept in one place so new screens use
 * them too. Every error says what went wrong and what to do, in one sentence.
 */

/** 401: nobody is signed in (or the session ended). */
export const NOT_SIGNED_IN =
  "You're not signed in, or your session has ended. Sign in again with your babcock.edu.ng account.";

/** 403: signed in, but this isn't theirs to see or change. */
export const NO_ACCESS =
  "You don't have access to this. If you need it for your work, ask Academic Planning through Ask DAP.";

/** 500: something failed on our side; `what` is the action, e.g. "load the courses". */
/**
 * Task U1: what a screen says when something breaks on the server or in the
 * page, instead of "Error 500" or a stack trace. "Saved work" because the
 * editors save as people type; anything typed in the last moment may not be.
 */
export const OUR_SIDE = "Something went wrong on our side. Your saved work is safe. Please try again in a minute.";

export function couldNot(what: string): string {
  return `Couldn't ${what.trim()} just now. Try again in a minute; if it keeps happening, tell Academic Planning through Ask DAP.`;
}

/** What a screen shows when the server gave no reason. */
export const TRY_AGAIN = "Try again in a minute; if it keeps happening, tell Academic Planning through Ask DAP.";
