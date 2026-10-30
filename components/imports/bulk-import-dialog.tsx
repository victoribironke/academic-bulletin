"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  downloadSpreadsheetTemplate,
  parseSpreadsheetFile,
  type SpreadsheetRecord,
  type TemplateColumn,
  type ValidatedImportRow,
} from "@/lib/imports/spreadsheet";

interface PreviewColumn<T> {
  label: string;
  value: (row: T) => string | number;
}

interface BulkImportDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  templateFilename: string;
  templateColumns: TemplateColumn[];
  templateRows: unknown[][];
  previewColumns: PreviewColumn<T>[];
  validateRows: (rows: SpreadsheetRecord[]) => ValidatedImportRow<T>[];
  onImport: (rows: T[]) => Promise<void>;
}

export function BulkImportDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  templateFilename,
  templateColumns,
  templateRows,
  previewColumns,
  validateRows,
  onImport,
}: BulkImportDialogProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const readRequestRef = useRef(0);
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<ValidatedImportRow<T>[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const reset = () => {
    readRequestRef.current += 1;
    setFilename("");
    setRows([]);
    setIsReading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !isImporting) reset();
    onOpenChange(next);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const requestId = readRequestRef.current + 1;
    readRequestRef.current = requestId;
    setIsReading(true);
    setFilename(file.name);
    try {
      const records = await parseSpreadsheetFile(file);
      if (requestId !== readRequestRef.current) return;
      if (records.length === 0) {
        setRows([]);
        toast.error("The spreadsheet does not contain any data rows.");
        return;
      }
      setRows(validateRows(records));
    } catch (error) {
      if (requestId !== readRequestRef.current) return;
      setRows([]);
      toast.error(error instanceof Error ? error.message : "Unable to read the spreadsheet.");
    } finally {
      if (requestId === readRequestRef.current) setIsReading(false);
    }
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadSpreadsheetTemplate(templateFilename, templateColumns, templateRows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the template.");
    }
  };

  const errorCount = rows.reduce((total, row) => total + row.errors.length, 0);
  const validRows = rows.filter((row) => row.errors.length === 0 && row.data);
  const invalidRows = rows.filter((row) => row.errors.length > 0 || !row.data);

  const importRows = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);
    try {
      await onImport(validRows.map((row) => row.data as T));
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk import failed.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`max-w-5xl overflow-hidden grid grid-rows-[auto_auto_minmax(0,1fr)_auto] ${
          rows.length > 0
            ? "h-[calc(100dvh-2rem)] max-h-[56rem] sm:h-[90vh]"
            : "max-h-[90vh]"
        }`}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 flex flex-wrap items-center gap-3 border rounded-md p-4 bg-muted/30">
          <Button
            type="button"
            variant="outline"
            onClick={handleTemplateDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          <Input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            className="max-w-sm"
            disabled={isReading || isImporting}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void handleFile(file);
            }}
          />
          {isReading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {filename && !isReading && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> {filename}
            </span>
          )}
        </div>

        <div className="min-h-0 overflow-hidden">
          {rows.length > 0 && (
            <div className="flex h-full min-h-0 flex-col gap-4">
            <Alert variant={errorCount > 0 ? "destructive" : "default"}>
              {errorCount > 0 ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertDescription>
                {errorCount > 0
                  ? `${validRows.length} valid row(s) are ready to import. ${invalidRows.length} row(s) with ${errorCount} validation issue(s) will be skipped.`
                  : `${validRows.length} row(s) are ready to import.`}
              </AlertDescription>
            </Alert>

            <ScrollArea className="min-h-0 flex-1 border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    {previewColumns.map((column) => (
                      <TableHead key={column.label}>{column.label}</TableHead>
                    ))}
                    <TableHead>Validation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.rowNumber} className={row.errors.length ? "bg-destructive/5" : ""}>
                      <TableCell>{row.rowNumber}</TableCell>
                      {previewColumns.map((column) => (
                        <TableCell key={column.label} className="max-w-56 truncate">
                          {row.data ? column.value(row.data) : "-"}
                        </TableCell>
                      ))}
                      <TableCell className={row.errors.length ? "text-destructive" : "text-green-700"}>
                        {row.errors.length ? row.errors.join(" ") : "Ready"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="relative z-20 shrink-0 border-t bg-background pt-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={importRows}
            disabled={isReading || isImporting || validRows.length === 0}
          >
            {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Import {validRows.length || ""}{errorCount > 0 ? " Valid" : ""} Row
            {validRows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
