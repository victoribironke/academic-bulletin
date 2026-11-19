import { describe, expect, it } from "vitest";
import { wwwRedirectTarget } from "@/lib/canonical-host";

const SITE = "https://academicplanning.app";

describe("www redirect", () => {
  it("sends www to the same page on the main address", () => {
    expect(
      wwwRedirectTarget(["www.academicplanning.app"], "/submissions/abc?tab=2", SITE),
    ).toBe("https://academicplanning.app/submissions/abc?tab=2");
    expect(wwwRedirectTarget(["www.academicplanning.app"], "/", SITE)).toBe(
      "https://academicplanning.app/",
    );
  });

  it("covers sign-in routes too", () => {
    expect(
      wwwRedirectTarget(["www.academicplanning.app"], "/api/auth/signin/google", SITE),
    ).toBe("https://academicplanning.app/api/auth/signin/google");
  });

  it("notices www in the forwarded host, whatever its case", () => {
    expect(
      wwwRedirectTarget(
        ["academic-bulletin.railway.internal:8080", "WWW.AcademicPlanning.app"],
        "/login",
        SITE,
      ),
    ).toBe("https://academicplanning.app/login");
    expect(
      wwwRedirectTarget([null, "www.academicplanning.app, proxy.example"], "/", SITE),
    ).toBe("https://academicplanning.app/");
  });

  it("leaves the main address and every other host alone", () => {
    expect(wwwRedirectTarget(["academicplanning.app"], "/dashboard", SITE)).toBeNull();
    expect(
      wwwRedirectTarget(["academic-bulletin-production.up.railway.app"], "/", SITE),
    ).toBeNull();
    expect(wwwRedirectTarget(["localhost:3000"], "/", SITE)).toBeNull();
    expect(wwwRedirectTarget([null, undefined], "/", SITE)).toBeNull();
  });

  it("never sends anyone to another site", () => {
    expect(wwwRedirectTarget(["www.evil.example"], "/", SITE)).toBeNull();
    for (const path of ["//evil.example/x", "/\\evil.example", "@evil.example"]) {
      const target = wwwRedirectTarget(["www.academicplanning.app"], path, SITE);
      expect(target && new URL(target).origin).toBe(SITE);
    }
  });
});
