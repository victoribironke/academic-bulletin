"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { usePermission, useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
import { Button } from "@/components/ui/button";
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

type Activity = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  createdAt: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null;
};

type ActivityResponse = {
  items: Activity[];
  total: number;
  page: number;
  pageCount: number;
  filters: {
    actions: string[];
    entityTypes: string[];
    actors: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    }>;
  };
};

function readable(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ActivityLogPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [page, setPage] = useState(1);

  const canView = hasPermission("view:audit");

  useEffect(() => {
    if (!userLoading && currentUser && !canView) router.replace("/dashboard");
  }, [canView, currentUser, router, userLoading]);

  useEffect(() => {
    if (!canView) return;
    const params = new URLSearchParams({ page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (action !== "all") params.set("action", action);
    if (entityType !== "all") params.set("entityType", entityType);
    if (actorId !== "all") params.set("actorId", actorId);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`/api/activity-log?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("activity-log");
          return response.json();
        })
        .then((result) => {
          setData(result);
          setFailed(false);
        })
        .catch((error) => {
          if (error.name !== "AbortError") setFailed(true);
        });
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [action, actorId, canView, entityType, page, query, reloadKey]);

  const hasFilters = useMemo(
    () =>
      query.trim() !== "" ||
      action !== "all" ||
      entityType !== "all" ||
      actorId !== "all",
    [action, actorId, entityType, query],
  );

  if (!userLoading && currentUser && !canView) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity Log"
        description="A permanent record of important actions taken in the bulletin system."
      />

      <TableToolbar
        search={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        searchPlaceholder="Search activity, person, or record ID"
        filters={
          <>
            <Select
              value={action}
              onValueChange={(value) => {
                setAction(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full bg-card sm:w-52" aria-label="Action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {data?.filters.actions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {readable(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={entityType}
              onValueChange={(value) => {
                setEntityType(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full bg-card sm:w-44" aria-label="Record type">
                <SelectValue placeholder="All records" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All record types</SelectItem>
                {data?.filters.entityTypes.map((value) => (
                  <SelectItem key={value} value={value}>
                    {readable(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={actorId}
              onValueChange={(value) => {
                setActorId(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full bg-card sm:w-52" aria-label="Person">
                <SelectValue placeholder="Everyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {data?.filters.actors.map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    {actor.firstName} {actor.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {failed ? (
        <ErrorState onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !data ? (
        <TableSkeleton columns={4} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={hasFilters ? "No activities match these filters" : "No activity recorded yet"}
          description={
            hasFilters
              ? "Change or clear the filters to see other activity."
              : "Important actions will appear here automatically."
          }
        />
      ) : (
        <>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-44">Date and time</TableHead>
                  <TableHead className="w-52">Person</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="hidden lg:table-cell">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.createdAt))}
                    </TableCell>
                    <TableCell className="align-top">
                      {item.actor ? (
                        <div>
                          <p className="text-sm font-medium">
                            {item.actor.firstName} {item.actor.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.actor.email}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <p className="text-sm">{item.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {readable(item.action)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden align-top text-sm text-muted-foreground lg:table-cell">
                      {readable(item.entityType)}
                      {item.entityId && (
                        <span className="block max-w-48 truncate font-mono text-xs">
                          {item.entityId}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data.total} recorded activities</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={data.page <= 1}
              >
                <ChevronLeft />
                Previous
              </Button>
              <span>
                Page {data.page} of {data.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => Math.min(data.pageCount, value + 1))}
                disabled={data.page >= data.pageCount}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
