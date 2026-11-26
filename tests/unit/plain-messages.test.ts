import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NOT_SIGNED_IN, NO_ACCESS, couldNot } from "@/lib/messages";

// Task U7: every error says what went wrong and what to do, and every empty
// screen says what to do next. These checks keep the bare forms out.

function filesUnder(dir: string, pattern: RegExp): string[] {
  const found: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (pattern.test(name)) found.push(relative(process.cwd(), full));
    }
  };
  walk(join(process.cwd(), dir));
  return found;
}

describe("helpful messages (U7)", () => {
  it("say what happened and what to do", () => {
    expect(NOT_SIGNED_IN).toMatch(/Sign in again/);
    expect(NO_ACCESS).toMatch(/Ask DAP/);
    expect(couldNot("load the courses")).toBe(
      "Couldn't load the courses just now. Try again in a minute; if it keeps happening, tell Academic Planning through Ask DAP.",
    );
  });

  it("are used by the server instead of bare words", () => {
    const files = [...filesUnder("app/api", /\.ts$/), "lib/api-auth.ts", "lib/mfa/server.ts"];
    const bare = files.filter((file) => {
      const code = readFileSync(file, "utf8");
      return /error: "(Forbidden|Unauthorized)"|message: "(Forbidden|Unauthorized)"|error: ["`]Failed to /.test(code);
    });
    expect(bare).toEqual([]);
  });

  it("never show \"Something went wrong\" on a screen", () => {
    const files = [...filesUnder("app", /\.tsx$/), ...filesUnder("components", /\.tsx$/)];
    expect(files.filter((file) => readFileSync(file, "utf8").includes("Something went wrong"))).toEqual([]);
  });

  it("give every empty screen a next step", () => {
    const files = [...filesUnder("app", /\.tsx$/), ...filesUnder("components", /\.tsx$/)];
    const bare = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/<EmptyState\b([\s\S]*?)\/>/g)]
        .filter((match) => !/description=|action=/.test(match[1]))
        .map(() => file),
    );
    expect(bare).toEqual([]);
  });
});
