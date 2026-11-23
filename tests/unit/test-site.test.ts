import { afterEach, describe, expect, it, vi } from "vitest";
import { isTestSite } from "@/lib/environment";
import { sendEmail, testSiteEmail } from "@/lib/email/resend";
import { getSiteUrl } from "@/lib/site-url";

const message = {
  to: ["hod.economics@babcock.edu.ng", "dean.vsss@babcock.edu.ng"],
  subject: "Economics was returned",
  html: "<p>Please revise.</p>",
  text: "Please revise.",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("test site (A1)", () => {
  it("is only the test site when APP_ENV says staging", () => {
    vi.stubEnv("APP_ENV", "");
    expect(isTestSite()).toBe(false);
    vi.stubEnv("APP_ENV", "production");
    expect(isTestSite()).toBe(false);
    vi.stubEnv("APP_ENV", " Staging ");
    expect(isTestSite()).toBe(true);
  });

  it("sends a test site's email only to the test inbox, marked and naming who it was for", () => {
    const redirected = testSiteEmail(message, " dap-test@babcock.edu.ng ");
    expect(redirected?.to).toEqual(["dap-test@babcock.edu.ng"]);
    expect(redirected?.subject).toBe("[TEST SITE] Economics was returned");
    expect(redirected?.text).toContain("hod.economics@babcock.edu.ng, dean.vsss@babcock.edu.ng");
    expect(redirected?.html).toContain("would have gone to");
    expect(testSiteEmail(message, undefined)).toBeNull();
    expect(testSiteEmail(message, "  ")).toBeNull();
  });

  it("never reaches a real person from the test site", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("APP_ENV", "staging");

    // No test inbox: nothing is sent at all.
    vi.stubEnv("TEST_EMAIL_INBOX", "");
    expect(await sendEmail(message)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    // With one: only the test inbox receives it.
    vi.stubEnv("TEST_EMAIL_INBOX", "dap-test@babcock.edu.ng");
    await sendEmail(message);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual(["dap-test@babcock.edu.ng"]);

    // The live site sends to the real recipients as before.
    vi.stubEnv("APP_ENV", "");
    await sendEmail(message);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).to).toEqual(message.to);
  });

  it("links emails to the copy of the site that sent them", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "https://academic-bulletin-staging.up.railway.app/");
    expect(getSiteUrl()).toBe("https://academic-bulletin-staging.up.railway.app");
    vi.stubEnv("AUTH_URL", "");
    expect(getSiteUrl()).toBe("https://academicplanning.app");
  });
});
