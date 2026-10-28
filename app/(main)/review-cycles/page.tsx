"use client";

import { useState, useEffect } from "react";
import { usePermission, useUser } from "@/contexts/user-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarClock, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type ReviewCycle = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  startedAt: string;
  closedAt: string | null;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  _count?: {
    submissions: number;
  };
};

export default function ReviewCyclesPage() {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const { currentUser, isLoading: userLoading } = useUser();
  const [cycles, setCycles] = useState<ReviewCycle[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCycle, setEditingCycle] = useState<ReviewCycle | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });
  const [error, setError] = useState("");

  const canManage = hasPermission("manage:cycles");

  const fetchData = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!userLoading && !canManage) router.push("/dashboard");
  }, [userLoading, canManage, router]);

  useEffect(() => {
    if (userLoading || !canManage) return;
    let cancelled = false;
    fetch("/api/cycles")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: ReviewCycle[]) => {
        if (cancelled) return;
        setCycles(data);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, canManage, reloadKey]);

  const handleToggleActive = async (cycle: ReviewCycle) => {
    if (
      cycle.isActive &&
      !confirm(`Close "${cycle.name}"? Departments won't be able to work in it until it's reopened.`)
    ) {
      return;
    }
    setTogglingId(cycle.id);
    try {
      const res = await fetch(`/api/cycles/${cycle.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cycle.isActive }),
      });
      if (res.ok) {
        toast.success(cycle.isActive ? "Cycle closed" : "Cycle reopened");
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update the cycle");
      }
    } catch {
      toast.error("Failed to update the cycle");
    } finally {
      setTogglingId(null);
    }
  };

  const openForm = (cycle?: ReviewCycle) => {
    setError("");
    if (cycle) {
      setEditingCycle(cycle);
      setFormData({
        name: cycle.name,
        description: cycle.description || "",
        isActive: cycle.isActive,
      });
    } else {
      setEditingCycle(null);
      setFormData({ name: "", description: "", isActive: true });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setError("");
    setIsSubmitting(true);
    const sanitize = (str: string) => str.replace(/<[^>]*>?/gm, "");
    const baseData = {
      name: sanitize(formData.name),
      description: sanitize(formData.description),
      isActive: formData.isActive,
    };

    try {
      const url = editingCycle
        ? `/api/cycles/${editingCycle.id}`
        : "/api/cycles";
      const method = editingCycle ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseData),
      });

      if (response.ok) {
        toast.success(
          `Review cycle ${editingCycle ? "updated" : "created"} successfully`,
        );
        setIsDialogOpen(false);
        fetchData();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save review cycle");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the review cycle "${name}"?\nAll associated submissions will also be deleted. This action cannot be undone.`,
      )
    )
      return;

    try {
      const url = `/api/cycles/${id}`;
      const response = await fetch(url, { method: "DELETE" });

      if (response.ok) {
        toast.success("Review cycle deleted successfully");
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to delete review cycle");
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred");
    }
  };

  if (!userLoading && !canManage) return null; // Prevent flicker while redirecting

  return (
    <div className="space-y-4">
      <PageHeader
        title="Review Cycles"
        description="Each cycle is one round of bulletin reviews. Only one cycle can be active at a time."
        actions={
          <Button onClick={() => openForm()}>
            <Plus />
            New cycle
          </Button>
        }
      />

      {failed ? (
        <ErrorState onRetry={fetchData} />
      ) : !cycles ? (
        <TableSkeleton columns={5} rows={3} />
      ) : cycles.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No review cycles yet"
          description="Start a cycle so departments can begin their bulletin submissions."
          action={
            <Button onClick={() => openForm()}>
              <Plus />
              New cycle
            </Button>
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Cycle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Started</TableHead>
                <TableHead className="hidden md:table-cell">Submissions</TableHead>
                <TableHead className="hidden lg:table-cell">Created by</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((cycle) => (
                <TableRow key={cycle.id}>
                  <TableCell>
                    <p className="font-medium">{cycle.name}</p>
                    {cycle.description && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {cycle.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {cycle.isActive ? (
                      <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Closed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {format(new Date(cycle.startedAt), "d MMM yyyy")}
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {cycle._count?.submissions ?? 0}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {cycle.createdBy.firstName} {cycle.createdBy.lastName}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(cycle)}
                        disabled={togglingId === cycle.id}
                      >
                        <Power />
                        <span className="hidden sm:inline">
                          {cycle.isActive ? "Close" : "Reopen"}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openForm(cycle)}
                        aria-label={`Edit ${cycle.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(cycle.id, cycle.name)}
                        aria-label={`Delete ${cycle.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCycle ? "Edit Review Cycle" : "Add Review Cycle"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label>Cycle Name *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g. 2025/2026 Bulletin Review"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description..."
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label>Active Status</Label>
                <div className="text-sm text-muted-foreground">
                  {formData.isActive
                    ? "This cycle is active and accepting submissions."
                    : "This cycle is closed."}
                  {!editingCycle && formData.isActive && (
                    <span className="block text-amber-600 mt-1">
                      Note: Making this active will close any currently active
                      cycles.
                    </span>
                  )}
                </div>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
            </div>
            {error && (
              <div className="text-sm font-medium text-destructive">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : editingCycle
                    ? "Save Changes"
                    : "Create Cycle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
