// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkImportDialog } from "@/components/imports/bulk-import-dialog";

const parseSpreadsheetFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/imports/spreadsheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imports/spreadsheet")>()),
  parseSpreadsheetFile,
  downloadSpreadsheetTemplate: vi.fn(),
}));

describe("bulk import dialog", () => {
  beforeEach(() => {
    parseSpreadsheetFile.mockReset();
  });

  it("keeps the import action available for valid rows when another row is invalid", async () => {
    parseSpreadsheetFile.mockResolvedValue([
      { Name: "Valid person" },
      { Name: "Invalid person" },
    ]);
    const onImport = vi.fn(async () => undefined);

    render(
      <BulkImportDialog<{ name: string }>
        open
        onOpenChange={vi.fn()}
        title="Bulk Upload Staff"
        description="Upload staff"
        templateFilename="staff.xlsx"
        templateColumns={[{ key: "name", label: "Name" }]}
        templateRows={[]}
        previewColumns={[{ label: "Name", value: (row) => row.name }]}
        validateRows={() => [
          {
            rowNumber: 2,
            raw: { Name: "Valid person" },
            data: { name: "Valid person" },
            errors: [],
          },
          {
            rowNumber: 3,
            raw: { Name: "Invalid person" },
            errors: ["A required value is missing."],
          },
        ]}
        onImport={onImport}
      />,
    );

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: { files: [new File(["staff"], "staff.xlsx")] },
    });

    const importButton = await screen.findByRole("button", {
      name: "Import 1 Valid Row",
    });
    const dialog = document.querySelector('[data-slot="dialog-content"]');
    const footer = document.querySelector('[data-slot="dialog-footer"]');
    const scrollArea = document.querySelector('[data-slot="scroll-area"]');
    expect(dialog?.className).toContain(
      "grid-rows-[auto_auto_minmax(0,1fr)_auto]",
    );
    expect(footer?.className).toContain("z-20");
    expect(scrollArea?.className).toContain("flex-1");
    expect((importButton as HTMLButtonElement).disabled).toBe(false);
    expect(input).toHaveProperty("value", "");

    fireEvent.click(importButton);
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith([{ name: "Valid person" }]);
    });
  });
});
