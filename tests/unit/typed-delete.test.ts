import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { deleteConfirmationMatches } from "@/lib/archive";
import { typedDeleteMatches } from "@/components/shared/typed-delete-dialog";

// Task Q7 (work order Appendix D): type DELETE to confirm every delete, on
// screen and on the server.

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

describe("the DELETE word", () => {
  it("matches DELETE in any letter case, with spaces at either end", () => {
    for (const typed of ["DELETE", "delete", "  Delete ", "DeLeTe"]) {
      expect(deleteConfirmationMatches(typed)).toBe(true);
      expect(typedDeleteMatches(typed)).toBe(true);
    }
  });

  it("keeps Delete switched off for anything else", () => {
    for (const typed of ["delet", "DELETED", "DEL ETE", "", "   ", "Archive Test School"]) {
      expect(deleteConfirmationMatches(typed)).toBe(false);
      expect(typedDeleteMatches(typed)).toBe(false);
    }
    expect(deleteConfirmationMatches(undefined)).toBe(false);
    expect(deleteConfirmationMatches(null)).toBe(false);
  });
});

describe("every delete route asks for DELETE", () => {
  // Not deletes (Appendix D, "Not covered"): they keep their own confirmation.
  const NOT_DELETES: Record<string, string> = {
    "app/api/users/[id]/sign-in-exception/route.ts":
      "ends a time-boxed sign-in exception early, like deactivating someone",
    "app/api/users/[id]/mfa/route.ts": "resets two-step verification; asks for the person's email instead",
  };

  it("finds every route with a DELETE handler and checks it", () => {
    const routes = filesUnder("app/api", /^route\.ts$/).filter((file) =>
      /export async function DELETE\b/.test(readFileSync(file, "utf8")),
    );
    expect(routes.length).toBeGreaterThanOrEqual(14);
    const missing = routes.filter(
      (file) => !NOT_DELETES[file] && !readFileSync(file, "utf8").includes("requireDeleteConfirmation("),
    );
    expect(missing).toEqual([]);
    // The exemptions are real routes, so a rename can't hide a gap.
    for (const file of Object.keys(NOT_DELETES)) expect(routes).toContain(file);
  });
});

describe("every delete control opens the DELETE box", () => {
  // Shared pieces whose callers supply the confirmation.
  const SHARED: Record<string, string> = {
    "components/shared/row-actions-menu.tsx": "a menu; its pages pass requestDelete from useDeleteRecord",
    "components/forms/dynamic-table.tsx": "a table; its pages pass confirmRemove (checked below)",
    "components/shared/delete-record-dialog.tsx": "the delete flow itself",
    "components/users/reset-two-step-dialog.tsx": "a reset, not a delete; asks for the person's email",
  };
  const USES_BOX = /useDeleteRecord|useConfirmDelete|TypedDeleteDialog/;

  it("finds every bin icon and DELETE request and checks it", () => {
    const files = [...filesUnder("app", /\.tsx$/), ...filesUnder("components", /\.tsx$/)];
    const controls = files.filter((file) => {
      const code = readFileSync(file, "utf8");
      return /<Trash2\b|method: "DELETE"/.test(code);
    });
    expect(controls.length).toBeGreaterThan(5);
    const missing = controls.filter((file) => !SHARED[file] && !USES_BOX.test(readFileSync(file, "utf8")));
    expect(missing).toEqual([]);
  });

  it("gives every editable table a DELETE check before rows go", () => {
    const tables = [...filesUnder("app", /\.tsx$/), ...filesUnder("components", /\.tsx$/)].flatMap((file) => {
      const code = readFileSync(file, "utf8");
      return [...code.matchAll(/<DynamicTable[\s\S]*?\/>/g)].map((match) => ({ file, tag: match[0] }));
    });
    expect(tables.length).toBeGreaterThanOrEqual(4);
    const unchecked = tables.filter(
      ({ tag }) => !tag.includes("confirmRemove=") && !tag.includes("allowDelete={false}"),
    );
    expect(unchecked.map(({ file }) => file)).toEqual([]);
  });

  it("sends DELETE with every delete request from the pages", () => {
    const files = [...filesUnder("app", /\.tsx$/), ...filesUnder("components", /\.tsx$/)];
    const requests = files.flatMap((file) => {
      const code = readFileSync(file, "utf8");
      return [...code.matchAll(/method: "DELETE",?([\s\S]{0,260})/g)].map((match) => ({ file, after: match[1] }));
    });
    const bare = requests.filter(
      ({ file, after }) =>
        !SHARED[file] && !/confirm/.test(after),
    );
    expect(bare.map(({ file }) => file)).toEqual([]);
  });
});
