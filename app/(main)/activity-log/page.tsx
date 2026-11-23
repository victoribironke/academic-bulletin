"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ScrollText, X } from "lucide-react";
import { usePermission, useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
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
import { formatDateWithDay, formatTime } from "@/lib/dates/format";

type Activity = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  /** A4: the record in plain words, never its ID. */
  record?: { label: string; name: string | null };
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
  /** A4: the cycle shown, and the cycles to choose from. */
  cycle?: { mode: "current" | "cycle" | "all"; id: string | null; name: string };
  cycles?: { id: string; name: string; current: boolean; archived: boolean; isTest: boolean }[];
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


function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function todayInput() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

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
  // "YYYY-MM-DD" from the date input, or "" for every day.
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  // A4: the log opens on the current cycle.
  const [cycleChoice, setCycleChoice] = useState("current");

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
    if (cycleChoice !== "current") params.set("cycle", cycleChoice);
    if (date) {
      // Midnight to midnight in the viewer's own time zone.
      const start = new Date(`${date}T00:00:00`);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        params.set("from", start.toISOString());
        params.set("to", end.toISOString());
      }
    }

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
  }, [action, actorId, canView, date, entityType, page, query, reloadKey, cycleChoice]);

  const hasFilters = useMemo(
    () =>
      query.trim() !== "" ||
      action !== "all" ||
      entityType !== "all" ||
      actorId !== "all" ||
      date !== "",
    [action, actorId, date, entityType, query],
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
        searchPlaceholder="Search activity or person"
        filters={
          <>
            <Select
              value={cycleChoice}
              onValueChange={(value) => {
                setCycleChoice(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full bg-card sm:w-64" aria-label="Cycle">
                <SelectValue placeholder="Current cycle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">
                  {data?.cycles?.find((cycle) => cycle.current)
                    ? `Current cycle: ${data.cycles.find((cycle) => cycle.current)!.name}`
                    : "Current (no cycle running)"}
                </SelectItem>
                {data?.cycles
                  ?.filter((cycle) => !cycle.current)
                  .map((cycle) => (
                    <SelectItem key={cycle.id} value={cycle.id}>
                      {cycle.name}
                      {cycle.archived ? ` (archived${cycle.isTest ? ", TEST" : ""})` : ""}
                    </SelectItem>
                  ))}
                <SelectItem value="all">All cycles</SelectItem>
              </SelectContent>
            </Select>
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
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={date}
                max={todayInput()}
                onChange={(event) => {
                  setDate(event.target.value);
                  setPage(1);
                }}
                className="w-full bg-card sm:w-40"
                aria-label="Date"
              />
              {date && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setDate("");
                    setPage(1);
                  }}
                  aria-label="Clear date"
                >
                  <X />
                </Button>
              )}
            </div>
          </>
        }
      />

      {data?.cycle && (
        <p className="text-sm text-muted-foreground">
          {data.cycle.mode === "all"
            ? "Showing every cycle's activity."
            : data.cycle.id
              ? `Showing activity in ${data.cycle.name}. Other cycles' entries are under the cycle list.`
              : "No cycle is running: showing everything except archived cycles' activity."}
        </p>
      )}

      {failed ? (
        <ErrorState onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !data ? (
        <TableSkeleton columns={4} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={
            hasFilters
              ? "No activities match these filters"
              : data.cycle?.mode === "all"
                ? "No activity recorded yet"
                : "No activity in this view yet"
          }
          description={
            hasFilters
              ? "Change or clear the filters to see other activity."
              : data.cycle?.mode === "all"
                ? "Important actions will appear here automatically."
                : "Earlier activity belongs to other cycles: choose one, or All cycles, in the cycle list above."
          }
        />
      ) : (
        <>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-24">Time</TableHead>
                  <TableHead className="w-40 @3xl:w-52">Person</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="hidden @3xl:table-cell">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item, index) => {
                  // A heading row starts each day, so the Time column can
                  // stay short.
                  const newDay =
                    index === 0 ||
                    dayKey(item.createdAt) !==
                      dayKey(data.items[index - 1].createdAt);
                  return (
                    <Fragment key={item.id}>
                      {newDay && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell
                            colSpan={4}
                            className="py-2 text-xs font-medium text-muted-foreground"
                          >
                            {formatDateWithDay(item.createdAt)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell className="align-top text-sm whitespace-nowrap text-muted-foreground">
                          {formatTime(item.createdAt)}
                        </TableCell>
                        <TableCell className="align-top whitespace-normal">
                          {item.actor ? (
                            <div>
                              <p className="text-sm font-medium">
                                {item.actor.firstName} {item.actor.lastName}
                              </p>
                              <p className="text-xs break-all text-muted-foreground">
                                {item.actor.email}
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">System</span>
                          )}
                        </TableCell>
                        {/* Q2: long descriptions wrap instead of widening the table. */}
                        <TableCell className="min-w-56 align-top whitespace-normal">
                          <p className="text-sm">{item.description}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {readable(item.action)}
                          </p>
                        </TableCell>
                        <TableCell className="hidden align-top text-sm text-muted-foreground @3xl:table-cell">
                          {item.record?.label ?? readable(item.entityType)}
                          {item.record?.name && (
                            <span className="block max-w-56 text-xs whitespace-normal text-foreground">
                              {item.record.name}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
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
