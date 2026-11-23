"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Loader2, RotateCcw } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** A whole cycle archived in place, with its drafts (task A2). */
type ArchivedCycle = {
  id: string;
  name: string;
  isTest: boolean;
  archivedAt: string;
  archivedBy: { firstName: string; lastName: string } | null;
  _count?: { submissions: number };
};

type ArchivedRecord = {
  id: string;
  entityType: string;
  label: string;
  archivedAt: string;
  archivedBy: { firstName: string; lastName: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  REVIEW_CYCLE: "Review cycle",
  SCHOOL: "School",
  DEPARTMENT: "Department",
  PROGRAMME: "Programme",
  MASTER_COURSE: "Registry course",
  STAFF: "Staff",
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function ArchivePage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const canRestore =
    currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const [records, setRecords] = useState<ArchivedRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [cycles, setCycles] = useState<ArchivedCycle[] | null>(null);

  useEffect(() => {
    if (!userLoading && !canRestore) router.push("/dashboard");
  }, [userLoading, canRestore, router]);

  useEffect(() => {
    if (userLoading || !canRestore) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/archive").then((res) => (res.ok ? res.json() : Promise.reject(res.status))),
      fetch("/api/cycles?archived=only").then((res) => (res.ok ? res.json() : Promise.reject(res.status))),
    ])
      .then(([data, archivedCycles]: [ArchivedRecord[], ArchivedCycle[]]) => {
        if (cancelled) return;
        setRecords(data);
        setCycles(archivedCycles);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, canRestore, reloadKey]);

  const restore = async (record: ArchivedRecord) => {
    setRestoringId(record.id);
    try {
      const res = await fetch(`/api/archive/${record.id}/restore`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${record.label} was restored.`);
        setReloadKey((key) => key + 1);
      } else {
        toast.error(`Couldn't restore ${record.label}`, {
          description: data.error ?? "Please try again.",
        });
      }
    } catch {
      toast.error(`Couldn't restore ${record.label}. Please try again.`);
    } finally {
      setRestoringId(null);
    }
  };

  const restoreCycle = async (cycle: ArchivedCycle) => {
    const drafts = cycle._count?.submissions ?? 0;
    if (
      !confirm(
        `Restore ${cycle.name}? Its ${drafts} drafts come back into dashboards, counts and lists, and Heads and Deans see them again. The cycle stays closed until someone reopens it.`,
      )
    ) {
      return;
    }
    setRestoringId(cycle.id);
    try {
      const res = await fetch(`/api/cycles/${cycle.id}/restore`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${cycle.name} was restored. It stays closed until reopened.`);
        setReloadKey((key) => key + 1);
      } else {
        toast.error(`Couldn't restore ${cycle.name}`, {
          description: data.error ?? "Please try again.",
        });
      }
    } catch {
      toast.error(`Couldn't restore ${cycle.name}. Please try again.`);
    } finally {
      setRestoringId(null);
    }
  };

  if (!userLoading && !canRestore) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Archive"
        description="Archived review cycles with their drafts, and deleted schools, departments, programmes, Registry courses and staff. Restoring puts a record back exactly as it was."
      />

      {cycles && cycles.length > 0 && (
        <section className="space-y-2" aria-labelledby="archived-cycles">
          <h2 id="archived-cycles" className="text-sm font-semibold">
            Archived cycles
          </h2>
          <p className="text-sm text-muted-foreground">
            Each cycle is kept whole, read-only, with its drafts, comments, photos and log
            entries. None of it shows in dashboards, counts or lists until it is restored.
          </p>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead scope="col">Cycle</TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">
                    Archived by
                  </TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">
                    Archived on
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell>
                      <p className="font-medium">{cycle.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant="secondary">Review cycle</Badge>
                        {cycle.isTest && <Badge variant="outline">TEST</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {cycle._count?.submissions ?? 0} drafts
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {cycle.archivedBy
                        ? `${cycle.archivedBy.firstName} ${cycle.archivedBy.lastName}`
                        : "Unknown"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {dateFormat.format(new Date(cycle.archivedAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreCycle(cycle)}
                        disabled={restoringId !== null}
                      >
                        {restoringId === cycle.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RotateCcw />
                        )}
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <h2 className="pt-2 text-sm font-semibold">Deleted records</h2>
        </section>
      )}

      {failed ? (
        <ErrorState onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !records ? (
        <TableSkeleton columns={4} rows={3} />
      ) : records.length === 0 && cycles && cycles.length > 0 ? (
        <p className="text-sm text-muted-foreground">No deleted records.</p>
      ) : records.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="The Archive is empty"
          description="Records you delete appear here, so they can be restored."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="col">Record</TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">
                  Deleted by
                </TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  Deleted on
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <p className="font-medium">{record.label}</p>
                    <Badge variant="secondary" className="mt-1">
                      {TYPE_LABELS[record.entityType] ?? record.entityType}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {record.archivedBy
                      ? `${record.archivedBy.firstName} ${record.archivedBy.lastName}`
                      : "Unknown"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {dateFormat.format(new Date(record.archivedAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restore(record)}
                      disabled={restoringId !== null}
                    >
                      {restoringId === record.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RotateCcw />
                      )}
                      Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
