/**
 * Task W4: each level's credit summary (General Education, Departmental,
 * Non-departmental and Total), built by the app from the Course Structure.
 * Nobody types it. Elective groups count as the units a student chooses (W3).
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreditSummary } from "@/lib/courses/credit-summary";

export function CreditSummaryTable({ summary, caption }: { summary: CreditSummary; caption?: string }) {
  if (summary.rows.length === 0) return null;
  return (
    <div className="overflow-x-auto text-sm">
      <Table className="w-full border">
        {caption && <caption className="caption-top pb-1 text-left text-xs text-muted-foreground">{caption}</caption>}
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Level</TableHead>
            <TableHead className="text-right">General Education</TableHead>
            <TableHead className="text-right">Departmental</TableHead>
            <TableHead className="text-right">Non-departmental</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.rows.map((row) => (
            <TableRow key={row.level}>
              <TableCell className="font-medium">{row.level} Level</TableCell>
              <TableCell className="text-right">{row.generalEducation}</TableCell>
              <TableCell className="text-right">{row.departmental}</TableCell>
              <TableCell className="text-right">{row.outside}</TableCell>
              <TableCell className="text-right font-semibold">{row.total}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/50">
            <TableCell className="font-bold">Total</TableCell>
            <TableCell className="text-right font-bold">{summary.totals.generalEducation}</TableCell>
            <TableCell className="text-right font-bold">{summary.totals.departmental}</TableCell>
            <TableCell className="text-right font-bold">{summary.totals.outside}</TableCell>
            <TableCell className="text-right font-bold">{summary.totals.total}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
