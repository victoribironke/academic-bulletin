import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import {
  REQUIRED_SECURITY_HEADERS,
  contentSecurityPolicy,
  securityHeaders,
} from "@/lib/security-headers";

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

describe("security headers", () => {
  it("sends every header the brief lists", () => {
    expect(Object.fromEntries(securityHeaders().map((h) => [h.key, h.value])))
      .toMatchObject({
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": expect.stringContaining("camera=()"),
        "Content-Security-Policy": expect.any(String),
      });
    expect(REQUIRED_SECURITY_HEADERS).toEqual([
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
  });

  it("allows only the app itself to run code or receive data", () => {
    const policy = directives(contentSecurityPolicy());
    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy["connect-src"]).toEqual(["'self'"]);
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["frame-src"]).toEqual(["'none'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    // The sign-in form hands over to Google's sign-in page.
    expect(policy["form-action"]).toEqual(["'self'", "https://accounts.google.com"]);
    expect(policy).toHaveProperty("upgrade-insecure-requests");
  });

  it("allows eval and plain HTTP only in development", () => {
    const policy = directives(contentSecurityPolicy({ development: true }));
    expect(policy["script-src"]).toContain("'unsafe-eval'");
    expect(policy).not.toHaveProperty("upgrade-insecure-requests");
  });

  it("applies the headers to every path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[0].headers.map((header) => header.key)).toEqual(REQUIRED_SECURITY_HEADERS);
  });
});
