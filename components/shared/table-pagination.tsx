"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "Showing 26–50 of 312 courses" with Previous / Next, under a table. */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  noun = "results",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  noun?: string;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <span>
        {total <= pageSize
          ? `${total} ${noun}`
          : `Showing ${first}–${last} of ${total} ${noun}`}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft />
            Previous
          </Button>
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            disabled={page >= pageCount}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Pages a list that is already in the browser. The page resets to 1 whenever
 * `resetKey` changes (pass the search text and filters), and is clamped if
 * the list shrinks, e.g. after a delete.
 */
export function useClientPagination<T>(
  items: T[],
  resetKey: string,
  pageSize = 25,
) {
  const [state, setState] = useState({ page: 1, resetKey });
  let page = state.resetKey === resetKey ? state.page : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  if (page > pageCount) page = pageCount;

  return {
    page,
    pageSize,
    total: items.length,
    pageItems: items.slice((page - 1) * pageSize, page * pageSize),
    setPage: (next: number) => setState({ page: next, resetKey }),
  };
}
