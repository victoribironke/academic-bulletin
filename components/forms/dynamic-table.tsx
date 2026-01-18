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
import { Plus, Trash2, GripVertical } from "lucide-react";

export interface Column<T> {
  key: keyof T;
  header: string;
  type: "text" | "number" | "select" | "readonly";
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
}: DynamicTableProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const addRow = () => {
    if (maxRows && data.length >= maxRows) return;
    onChange([...data, createEmptyRow()]);
  };

  const removeRow = (index: number) => {
    if (data.length <= 1) return;
    const newData = [...data];
    newData.splice(index, 1);
    onChange(newData);
  };

  const updateCell = (index: number, key: keyof T, value: unknown) => {
    const newData = [...data];
    newData[index] = { ...newData[index], [key]: value };
    onChange(newData);
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

    if (disabled || column.type === "readonly") {
      return <span className="text-sm text-gray-600">{value as string}</span>;
    }

    switch (column.type) {
      case "text":
        return (
          <Input
            value={(value as string) || ""}
            onChange={(e) => updateCell(rowIndex, column.key, e.target.value)}
            placeholder={column.placeholder}
            className="h-8 text-sm"
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={(value as number) || ""}
            onChange={(e) =>
              updateCell(rowIndex, column.key, parseInt(e.target.value) || 0)
            }
            placeholder={column.placeholder}
            className="h-8 text-sm w-20"
          />
        );

      case "select":
        return (
          <Select
            value={(value as string) || ""}
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

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
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
                    draggedIndex === rowIndex ? "opacity-50 bg-muted" : ""
                  }
                >
                  <TableCell className="p-1 cursor-grab">
                    {!disabled && (
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(rowIndex)}
                        disabled={data.length <= 1}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
