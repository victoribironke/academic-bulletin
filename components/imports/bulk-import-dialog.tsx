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
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<ValidatedImportRow<T>[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const reset = () => {
    setFilename("");
    setRows([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !isImporting) reset();
    onOpenChange(next);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsReading(true);
    setFilename(file.name);
    try {
      const records = await parseSpreadsheetFile(file);
      if (records.length === 0) {
        setRows([]);
        toast.error("The spreadsheet does not contain any data rows.");
        return;
      }
      setRows(validateRows(records));
    } catch (error) {
      setRows([]);
      toast.error(error instanceof Error ? error.message : "Unable to read the spreadsheet.");
    } finally {
      setIsReading(false);
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

  const importRows = async () => {
    if (errorCount > 0 || validRows.length === 0) return;
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
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 border rounded-md p-4 bg-muted/30">
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
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          {isReading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {filename && !isReading && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> {filename}
            </span>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <Alert variant={errorCount > 0 ? "destructive" : "default"}>
              {errorCount > 0 ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertDescription>
                {errorCount > 0
                  ? `${errorCount} validation issue(s) must be corrected before import. No rows have been saved.`
                  : `${validRows.length} row(s) are ready to import.`}
              </AlertDescription>
            </Alert>

            <ScrollArea className="flex-1 min-h-0 max-h-[52vh] border rounded-md">
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
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={importRows}
            disabled={isReading || isImporting || validRows.length === 0 || errorCount > 0}
          >
            {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Import {validRows.length || ""} Row{validRows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
