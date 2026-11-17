/**
 * Scans a running site and fails if any route is missing a security header.
 *
 *   bun run test:headers https://staging.example.com
 *
 * Redirects are not followed, so the redirect responses themselves (signed-out
 * pages bouncing to /login, the bare domain to www) are checked too.
 */
import { REQUIRED_SECURITY_HEADERS } from "../lib/security-headers";

// Pages, API routes, the auth callback, a redirect and a 404.
const ROUTES = [
  "/",
  "/login",
  "/dashboard",
  "/submissions",
  "/auth/callback",
  "/api/users/me",
  "/api/cycles",
  "/api/submissions/does-not-exist",
  "/this-page-does-not-exist",
];

async function main() {
  const baseUrl = process.argv[2]?.replace(/\/$/, "");
  if (!baseUrl) {
    console.error("Usage: bun run test:headers <base URL>");
    process.exit(2);
  }

  let failures = 0;
  for (const route of ROUTES) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    const missing = REQUIRED_SECURITY_HEADERS.filter((name) => !response.headers.has(name));
    const csp = response.headers.get("content-security-policy") ?? "";
    if (csp && !csp.includes("frame-ancestors 'none'")) missing.push("CSP frame-ancestors");
    if (missing.length > 0) failures++;
    console.log(
      `${missing.length ? "FAIL" : "ok  "}  ${response.status}  ${route}${missing.length ? `  missing: ${missing.join(", ")}` : ""}`,
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} of ${ROUTES.length} routes are missing security headers.`);
    process.exit(1);
  }
  console.log(`\nAll ${ROUTES.length} routes carry the security headers.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
