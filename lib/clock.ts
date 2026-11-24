/**
 * Today's date for deadlines, with the test site's pretend clock (work order
 * section 13: "a pretend clock, a test-only setting for today"). Server only.
 *
 * On the test site a tester sets a pretend date and time from the TEST SITE
 * banner (a cookie in their own browser). Countdowns, checkpoints, "My desk"
 * and the "Submit to School" date then behave as on that date, for that
 * tester only. The live site ignores the cookie and always uses the real
 * time. Sign-in, two-step codes, remembered devices and invitations always
 * use the real time, on both sites: they never call this.
 */
import { isTestSite } from "@/lib/environment";
import { PRETEND_NOW_COOKIE, parsePretendNow } from "@/lib/pretend-clock";

/**
 * Now, for deadlines: the tester's pretend time on the test site, otherwise
 * the real time. Outside a request (scripts, the daily job) it is always the
 * real time.
 */
export async function calendarNow(): Promise<Date> {
  if (!isTestSite()) return new Date();
  try {
    const { cookies } = await import("next/headers");
    return parsePretendNow((await cookies()).get(PRETEND_NOW_COOKIE)?.value) ?? new Date();
  } catch {
    return new Date();
  }
}
