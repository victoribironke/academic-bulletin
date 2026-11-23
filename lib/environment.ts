/**
 * Which copy of the app this is (work order task A1). The live site leaves
 * APP_ENV unset; the test site sets APP_ENV=staging, which shows a TEST SITE
 * banner on every page and keeps its email away from real people.
 */
export function isTestSite(): boolean {
  return process.env.APP_ENV?.trim().toLowerCase() === "staging";
}
