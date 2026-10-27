"use client";

import { useState, useEffect } from "react";
import { usePermission, useUser } from "@/contexts/user-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
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
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const fetchData = async () => {
    try {
      const response = await fetch("/api/cycles");
      if (response.ok) {
        const data = await response.json();
        setCycles(data);
      }
    } catch (err) {
      console.error("Failed to fetch review cycles:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!userLoading && !canManage) {
      router.push("/dashboard");
    } else if (!userLoading) {
      fetchData();
    }
  }, [userLoading, canManage, router]);

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

  if (userLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading review cycles...
      </div>
    );
  }

  if (!canManage) return null; // Prevent flicker while redirecting

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Cycles</h1>
          <p className="text-muted-foreground">
            Manage academic bulletin review periods
          </p>
        </div>
        <Button onClick={() => openForm()}>
          <Plus className="mr-2 h-4 w-4" />
          New Cycle
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started At</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center h-24 text-muted-foreground"
                  >
                    No review cycles found.
                  </TableCell>
                </TableRow>
              ) : (
                cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{cycle.name}</div>
                        {cycle.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {cycle.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cycle.isActive ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Closed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(cycle.startedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {cycle._count?.submissions || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cycle.createdBy.firstName} {cycle.createdBy.lastName}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openForm(cycle)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDelete(cycle.id, cycle.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
