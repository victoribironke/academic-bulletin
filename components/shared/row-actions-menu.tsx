"use client";

import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * A row's "more actions" menu, holding Delete, so it isn't one click away on
 * every row.
 */
export function RowActionsMenu({
  label,
  onDelete,
  busy = false,
  disabled = false,
  className,
}: {
  /** What the row is, for the button's accessible name. */
  label: string;
  onDelete: () => void;
  /** Shows a spinner while the delete is being checked. */
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(className)}
          disabled={disabled || busy}
          aria-label={`More actions for ${label}`}
        >
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
