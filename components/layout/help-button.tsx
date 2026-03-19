"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpCircle } from "lucide-react";
import { useUser } from "@/contexts/user-context";

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const { currentUser } = useUser();
  const isAdmin =
    currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50"
        >
          <HelpCircle className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Start Guide</DialogTitle>
          <DialogDescription>
            Welcome to the Academic Bulletin system. Here&apos;s how to get
            started.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold text-base">Navigation</h3>
            <p className="text-muted-foreground">
              Use the sidebar on the left to navigate between sections. The main
              areas are:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>
                <strong>Dashboard</strong> — Overview of your activity and
                pending tasks
              </li>
              <li>
                <strong>Programmes</strong> — View and manage academic
                programmes
              </li>
              <li>
                <strong>Submissions</strong> — Create, review and track bulletin
                submissions
              </li>
              <li>
                <strong>Schools & Departments</strong> — Organizational
                structure
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Creating a Submission</h3>
            <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
              <li>Navigate to the Submissions page</li>
              <li>
                Click <strong>New Submission</strong>
              </li>
              <li>Select the programme and review cycle</li>
              <li>Fill out each section of the bulletin</li>
              <li>Submit for review when complete</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Review Workflow</h3>
            <p className="text-muted-foreground">
              Submissions go through multiple review phases. At each phase, the
              relevant reviewer (HOD, Dean, or Admin) can approve, return for
              revision, or add comments.
            </p>
          </section>

          {isAdmin && (
            <section className="space-y-2">
              <h3 className="font-semibold text-base">
                Managing Users (Admin)
              </h3>
              <p className="text-muted-foreground">
                As an administrator, you can create new user accounts from the
                Users page. New users will receive an invite email to set their
                password. Super Admins can also activate or deactivate accounts.
              </p>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Need More Help?</h3>
            <p className="text-muted-foreground">
              Contact your system administrator for further assistance.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
