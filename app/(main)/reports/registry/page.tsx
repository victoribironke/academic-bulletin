"use client";

/**
 * The Registry completeness report (work order task B8), for Academic
 * Planning: one line per programme, its semesters and course issues on
 * request, and the whole report as a spreadsheet.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Download } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates/format";

type Programme = {
  code: string;
  name: string;
  isNew: boolean;
  courses: number;
  totalCredits: number;
  statedTotal: number | null;
  semestersOutOfRange: number;
  missingDescription: number;
  missingOutcomes: number;
  noOwner: number;
  duplicates: number;
};
type Semester = {
  programmeCode: string;
  level: number;
  semester: string;
  courses: number;
  credits: number;
  withinRange: boolean | null;
};
type Issue = { programmeCode: string; code: string; title: string; issue: string };
type Report = { generatedAt: string; tookMs: number; programmes: Programme[]; semesters: Semester[]; issues: Issue[] };

const flag = (count: number) => (count > 0 ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground");

export default function RegistryReportPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  useEffect(() => {
    if (userLoading || !allowed) return;
    let cancelled = false;
    fetch("/api/reports/registry")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: Report) => {
        if (cancelled) return;
        setReport(data);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, allowed, reloadKey]);

  const chosen = useMemo(() => report?.programmes.find((programme) => programme.code === selected) ?? null, [report, selected]);

  if (!userLoading && !allowed) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Registry completeness"
        description={
          report
            ? `Each programme's Registry courses, as of ${formatDateTime(report.generatedAt)} (built in ${(report.tookMs / 1000).toFixed(1)} seconds). Semesters should carry 16 to 24 credits.`
            : "Each programme's Registry courses: credits per semester, totals, and courses to fix."
        }
        actions={
          <Button asChild variant="outline">
            <a href="/api/reports/registry?format=xlsx">
              <Download />
              Download spreadsheet
            </a>
          </Button>
        }
      />

      {failed ? (
        <ErrorState onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !report ? (
        <TableSkeleton columns={6} rows={8} />
      ) : report.programmes.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No programmes yet" description="Programmes appear here once the Registry has them." />
      ) : (
        <>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Programme</TableHead>
                  <TableHead className="text-right">Courses</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="hidden text-right @2xl:table-cell">Stated in draft</TableHead>
                  <TableHead className="text-right">Semesters outside 16-24</TableHead>
                  <TableHead className="hidden text-right @3xl:table-cell">No description</TableHead>
                  <TableHead className="hidden text-right @3xl:table-cell">No outcomes</TableHead>
                  <TableHead className="hidden text-right @4xl:table-cell">No owner</TableHead>
                  <TableHead className="hidden text-right @4xl:table-cell">Possible duplicates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.programmes.map((programme) => (
                  <TableRow
                    key={programme.code}
                    className={`cursor-pointer ${selected === programme.code ? "bg-muted/60" : ""}`}
                    onClick={() => setSelected(programme.code === selected ? null : programme.code)}
                  >
                    <TableCell className="min-w-48 whitespace-normal">
                      <p className="font-medium">
                        {programme.name}
                        {programme.isNew && (
                          <Badge variant="outline" className="ml-2 align-middle">
                            New
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{programme.code}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{programme.courses}</TableCell>
                    <TableCell className="text-right tabular-nums">{programme.totalCredits}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground @2xl:table-cell">
                      {programme.statedTotal ?? "Not stated"}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${flag(programme.semestersOutOfRange)}`}>
                      {programme.semestersOutOfRange}
                    </TableCell>
                    <TableCell className={`hidden text-right tabular-nums @3xl:table-cell ${flag(programme.missingDescription)}`}>
                      {programme.missingDescription}
                    </TableCell>
                    <TableCell className={`hidden text-right tabular-nums @3xl:table-cell ${flag(programme.missingOutcomes)}`}>
                      {programme.missingOutcomes}
                    </TableCell>
                    <TableCell className={`hidden text-right tabular-nums @4xl:table-cell ${flag(programme.noOwner)}`}>
                      {programme.noOwner}
                    </TableCell>
                    <TableCell className={`hidden text-right tabular-nums @4xl:table-cell ${flag(programme.duplicates)}`}>
                      {programme.duplicates}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <p className="text-sm text-muted-foreground">
            {chosen ? `${chosen.name}: semesters and courses to fix below.` : "Choose a programme to see its semesters and the courses to fix."}
          </p>

          {chosen && (
            <div className="grid gap-4 lg:grid-cols-2">
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Level</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead className="text-right">Courses</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.semesters
                      .filter((row) => row.programmeCode === chosen.code)
                      .map((row) => (
                        <TableRow key={`${row.level}:${row.semester}`}>
                          <TableCell>{row.level}</TableCell>
                          <TableCell>{row.semester}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.courses}</TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${row.withinRange === false ? "font-medium text-amber-700 dark:text-amber-300" : ""}`}
                          >
                            {row.credits}
                            {row.withinRange === false && <span className="sr-only"> (outside 16 to 24)</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableCard>
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Course</TableHead>
                      <TableHead>To fix</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.issues.filter((item) => item.programmeCode === chosen.code).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          Nothing to fix.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.issues
                        .filter((item) => item.programmeCode === chosen.code)
                        .map((item, index) => (
                          <TableRow key={`${item.code}:${index}`}>
                            <TableCell className="min-w-40 whitespace-normal">
                              <p className="font-medium">{item.code}</p>
                              <p className="text-xs text-muted-foreground">{item.title}</p>
                            </TableCell>
                            <TableCell className="whitespace-normal text-sm">{item.issue}</TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
