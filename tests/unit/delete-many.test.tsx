// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DynamicTable, type Column } from "@/components/forms/dynamic-table";
import { TypedDeleteDialog } from "@/components/shared/typed-delete-dialog";

afterEach(cleanup);

// Work order Q7, Appendix D and launch test 16: deleting 12 course rows needs
// one confirmation listing all 12.
type Row = { code: string; title: string; locked?: boolean };
const columns: Column<Row>[] = [
  { key: "code", header: "Code", type: "text" },
  { key: "title", header: "Title", type: "text" },
];
const rows: Row[] = [
  ...Array.from({ length: 12 }, (_, index) => ({ code: `ABC ${101 + index}`, title: `Course ${index + 1}` })),
  { code: "GST 111", title: "Communication in English", locked: true },
];

describe("ticking several rows", () => {
  it("deletes every ticked row after one confirmation, and never a locked row", async () => {
    const onChange = vi.fn();
    const confirmRemoveMany = vi.fn(async () => true);
    render(
      <DynamicTable<Row>
        columns={columns}
        data={rows}
        onChange={onChange}
        createEmptyRow={() => ({ code: "", title: "" })}
        isRowLocked={(row) => Boolean(row.locked)}
        confirmRemoveMany={confirmRemoveMany}
      />,
    );

    // The locked General Education row has no tick box.
    expect(screen.getAllByRole("checkbox", { name: /^Select row/ })).toHaveLength(12);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows that can be deleted" }));
    expect(screen.getByText("12 rows selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete 12 rows" }));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(confirmRemoveMany).toHaveBeenCalledTimes(1);
    expect((confirmRemoveMany.mock.calls[0] as unknown as [Row[]])[0]).toHaveLength(12);
    expect(onChange).toHaveBeenCalledWith([rows[12]]);
  });

  it("keeps the rows when the confirmation is cancelled", async () => {
    const onChange = vi.fn();
    const confirmRemoveMany = vi.fn(async () => false);
    render(
      <DynamicTable<Row>
        columns={columns}
        data={rows.slice(0, 3)}
        onChange={onChange}
        createEmptyRow={() => ({ code: "", title: "" })}
        confirmRemoveMany={confirmRemoveMany}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 2 rows" }));
    await vi.waitFor(() => expect(confirmRemoveMany).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows no tick boxes on a read-only table", () => {
    render(
      <DynamicTable<Row>
        columns={columns}
        data={rows.slice(0, 3)}
        onChange={vi.fn()}
        createEmptyRow={() => ({ code: "", title: "" })}
        disabled
        confirmRemoveMany={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("the DELETE box for several rows", () => {
  it("lists the first 10, then how many more, and waits for DELETE and a reason", () => {
    const onConfirm = vi.fn();
    render(
      <TypedDeleteDialog
        open
        content={{
          title: "Delete 12 course rows?",
          description: "They can be restored from the Archive.",
          items: rows.slice(0, 12).map((row) => `${row.code} ${row.title}`),
          actionLabel: "Delete 12 rows",
          askReason: true,
        }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("ABC 110 Course 10")).toBeTruthy();
    expect(screen.queryByText("ABC 111 Course 11")).toBeNull();
    expect(screen.getByText("and 2 more")).toBeTruthy();

    const button = screen.getByRole("button", { name: "Delete 12 rows" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    // Still off: deleting another unit's rows needs a reason.
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Why are you deleting this?"), {
      target: { value: "Moved to the new programme." },
    });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("Moved to the new programme.");
  });
});
