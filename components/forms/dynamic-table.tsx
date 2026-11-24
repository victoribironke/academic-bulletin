"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, GripVertical, Lock } from "lucide-react";

export interface Column<T> {
  key: keyof T;
  header: string;
  type: "text" | "number" | "select" | "readonly" | "combobox";
  /** Lowest and highest value for a number column. */
  min?: number;
  max?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
  width?: string;
  required?: boolean;
}

interface DynamicTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  onChange: (data: T[]) => void;
  createEmptyRow: () => T;
  disabled?: boolean;
  maxRows?: number;
  showRowNumbers?: boolean;
  allowDelete?: boolean;
  allowReorder?: boolean;
  isRowLocked?: (row: T) => boolean;
  /** Said for a locked row, e.g. "General Education: every student takes this". */
  lockedRowLabel?: string;
  isRowEditable?: (row: T) => boolean;
  onRowUpdate?: (row: T, key: keyof T, value: unknown) => T;
  /**
   * Q7: asked before a row is removed. Resolve false to keep it (the person
   * cancelled the DELETE box). Rows that were never saved need no asking.
   */
  confirmRemove?: (row: T, index: number) => Promise<boolean>;
  /**
   * Q7: lets the person tick several rows and delete them with one DELETE
   * confirmation, which lists them. Resolve false to keep them.
   */
  confirmRemoveMany?: (rows: T[]) => Promise<boolean>;
}

export function DynamicTable<T extends Record<string, unknown>>({
  columns,
  data,
  onChange,
  createEmptyRow,
  disabled = false,
  maxRows,
  showRowNumbers = true,
  allowDelete = true,
  isRowLocked,
  lockedRowLabel = "Locked",
  isRowEditable,
  onRowUpdate,
  confirmRemove,
  confirmRemoveMany,
}: DynamicTableProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // Ticked rows (Q7), kept by row so reordering doesn't move the ticks.
  const [selected, setSelected] = useState<Set<T>>(() => new Set());
  const selectable = Boolean(confirmRemoveMany) && allowDelete && !disabled;
  const deletableRows = data.filter((row) => !isRowLocked?.(row));
  const selectedRows = selectable ? data.filter((row) => selected.has(row)) : [];
  const allSelected = deletableRows.length > 0 && selectedRows.length === deletableRows.length;

  const toggleRow = (row: T, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(row);
      else next.delete(row);
      return next;
    });
  const toggleAll = (on: boolean) => setSelected(on ? new Set(deletableRows) : new Set());

  const removeSelected = async () => {
    const rows = selectedRows;
    if (rows.length === 0 || !confirmRemoveMany) return;
    if (!(await confirmRemoveMany(rows))) return;
    onChange(data.filter((item) => !rows.includes(item)));
    setSelected(new Set());
  };

  const addRow = () => {
    if (maxRows && data.length >= maxRows) return;
    onChange([...data, createEmptyRow()]);
  };

  const removeRow = async (index: number) => {
    const row = data[index];
    if (confirmRemove && !(await confirmRemove(row, index))) return;
    // Remove that row from the data as it is now, in case it changed meanwhile.
    onChange(data.filter((item) => item !== row));
    toggleRow(row, false);
  };

  const updateCell = (index: number, key: keyof T, value: unknown) => {
    const newData = [...data];
    let updatedRow = { ...newData[index], [key]: value };

    if (onRowUpdate) {
      updatedRow = onRowUpdate(updatedRow, key, value);
    }

    newData[index] = updatedRow;
    onChange(newData);
    // An edited row keeps its tick.
    const before = data[index];
    if (selected.has(before)) {
      setSelected((current) => {
        const next = new Set(current);
        next.delete(before);
        next.add(updatedRow);
        return next;
      });
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newData = [...data];
    const draggedItem = newData[draggedIndex];
    newData.splice(draggedIndex, 1);
    newData.splice(index, 0, draggedItem);
    onChange(newData);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const renderCell = (row: T, rowIndex: number, column: Column<T>) => {
    const value = row[column.key];
    const rowEditable = isRowEditable ? isRowEditable(row) : true;

    if (disabled || column.type === "readonly" || !rowEditable) {
      if (column.type === "select" || column.type === "combobox") {
        const option = column.options?.find(
          (o) => String(o.value) === String(value),
        );
        const label = option ? option.label : (value as string);
        return (
          <span className="text-sm text-gray-600 truncate block" title={label || ""}>
            {label}
          </span>
        );
      }
      return (
        <span className="text-sm text-gray-600 truncate block" title={(value as string) || ""}>
          {value as string}
        </span>
      );
    }

    switch (column.type) {
      case "text":
        return (
          <Input
            value={(value as string) || ""}
            onChange={(e) => updateCell(rowIndex, column.key, e.target.value)}
            placeholder={column.placeholder}
            title={(value as string) || ""}
            className="h-8 text-sm"
          />
        );

      case "number":
        return (
          <Input
            type="number"
            // Show 0 as 0: a course can carry 0 units (B13).
            value={value === undefined || value === null ? "" : (value as number)}
            min={column.min}
            max={column.max}
            onChange={(e) =>
              updateCell(rowIndex, column.key, parseInt(e.target.value) || 0)
            }
            placeholder={column.placeholder}
            className="h-8 text-sm w-20"
          />
        );

      case "select":
        // Convert value to string for comparison (handles number values from DB)
        const stringValue =
          value !== undefined && value !== null ? String(value) : "";
        return (
          <Select
            value={stringValue}
            onValueChange={(v) => updateCell(rowIndex, column.key, v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={column.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {column.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "combobox":
        const listId = `datalist-${String(column.key)}-${rowIndex}`;
        return (
          <>
            <Input
              value={(value as string) || ""}
              onChange={(e) => updateCell(rowIndex, column.key, e.target.value)}
              placeholder={column.placeholder}
              title={(value as string) || ""}
              className="h-8 text-sm"
              list={listId}
            />
            {column.options && (
              <datalist id={listId}>
                {column.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </datalist>
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      {selectable && selectedRows.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          role="region"
          aria-label="Selected rows"
        >
          <span aria-live="polite">
            {selectedRows.length} {selectedRows.length === 1 ? "row" : "rows"} selected
          </span>
          <Button type="button" variant="destructive" size="sm" onClick={() => void removeSelected()}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
            Delete {selectedRows.length} {selectedRows.length === 1 ? "row" : "rows"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => toggleAll(false)}>
            Clear selection
          </Button>
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              {selectable && (
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected ? true : selectedRows.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(state) => toggleAll(state === true)}
                    disabled={deletableRows.length === 0}
                    aria-label="Select all rows that can be deleted"
                  />
                </TableHead>
              )}
              {showRowNumbers && <TableHead className="w-12">#</TableHead>}
              {columns.map((column) => (
                <TableHead
                  key={String(column.key)}
                  style={{ width: column.width }}
                  className="text-xs font-medium"
                >
                  {column.header}
                  {column.required && (
                    <span className="text-red-500 ml-1">*</span>
                  )}
                </TableHead>
              ))}
              {allowDelete && !disabled && (
                <TableHead className="w-12"></TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={
                    columns.length +
                    (showRowNumbers ? 2 : 1) +
                    (selectable ? 1 : 0) +
                    (allowDelete ? 1 : 0)
                  }
                  className="h-20 text-center text-muted-foreground"
                >
                  No entries. Click &quot;Add Row&quot; to add one.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  draggable={!disabled}
                  onDragStart={() => handleDragStart(rowIndex)}
                  onDragOver={(e) => handleDragOver(e, rowIndex)}
                  onDragEnd={handleDragEnd}
                  className={
                    draggedIndex === rowIndex
                      ? "opacity-50 bg-muted"
                      : isRowLocked?.(row)
                        ? "bg-muted/40 text-muted-foreground"
                        : ""
                  }
                >
                  <TableCell className="p-1 cursor-grab">
                    {!disabled && (
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  {selectable && (
                    <TableCell className="p-1">
                      {!isRowLocked?.(row) && (
                        <Checkbox
                          checked={selected.has(row)}
                          onCheckedChange={(state) => toggleRow(row, state === true)}
                          aria-label={`Select row ${rowIndex + 1}`}
                        />
                      )}
                    </TableCell>
                  )}
                  {showRowNumbers && (
                    <TableCell className="text-xs text-muted-foreground font-medium">
                      {rowIndex + 1}
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={String(column.key)} className="p-1">
                      {renderCell(row, rowIndex, column)}
                    </TableCell>
                  ))}
                  {allowDelete && !disabled && (
                    <TableCell className="p-1">
                      {!isRowLocked?.(row) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void removeRow(rowIndex)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete row ${rowIndex + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {isRowLocked?.(row) && (
                        <div
                          className="w-8 h-8 flex items-center justify-center text-muted-foreground"
                          title={lockedRowLabel}
                        >
                          <Lock className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">{lockedRowLabel}</span>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={maxRows ? data.length >= maxRows : false}
          className="w-full border-dashed"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Row
        </Button>
      )}
    </div>
  );
}

export default DynamicTable;
