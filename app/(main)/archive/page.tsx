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

  useEffect(() => {
    if (!userLoading && !canRestore) router.push("/dashboard");
  }, [userLoading, canRestore, router]);

  useEffect(() => {
    if (userLoading || !canRestore) return;
    let cancelled = false;
    fetch("/api/archive")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: ArchivedRecord[]) => {
        if (cancelled) return;
        setRecords(data);
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

  if (!userLoading && !canRestore) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Archive"
        description="Deleted review cycles, schools, departments, programmes, Registry courses and staff. Restoring puts a record back exactly as it was."
      />

      {failed ? (
        <ErrorState onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !records ? (
        <TableSkeleton columns={4} rows={3} />
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
