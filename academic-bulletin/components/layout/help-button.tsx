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
            Follow this workflow-focused guide to complete, review, and publish
            bulletin content with fewer delays.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold text-base">How Work Flows</h3>
            <p className="text-muted-foreground">
              Bulletin updates move through a review pipeline. Complete your
              assigned steps, save often, and only submit when required sections
              are ready.
            </p>
            <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
              <li>Open or create the correct submission for your programme.</li>
              <li>Complete section data and upload required photos/documents.</li>
              <li>Resolve validation or image verification feedback.</li>
              <li>Save draft changes, then submit for the next review phase.</li>
              <li>Address comments, update content, and resubmit if returned.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Where To Do Things</h3>
            <p className="text-muted-foreground">
              Use the sidebar to move quickly to the right task area:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>
                <strong>Dashboard</strong> — Overview of your activity and
                pending review actions
              </li>
              <li>
                <strong>Programmes</strong> — View and manage academic
                programmes and structure
              </li>
              <li>
                <strong>Submissions</strong> — Create, edit, review, and track
                bulletin updates
              </li>
              <li>
                <strong>Schools & Departments</strong> — Organizational
                ownership and relationships
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">For Submitters (HOD/Owners)</h3>
            <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
              <li>Go to the Submissions page and open your programme draft.</li>
              <li>Fill each section and keep entries consistent.</li>
              <li>Use Save Draft after major edits to prevent data loss.</li>
              <li>Upload clear passport-style photos for required profiles.</li>
              <li>Fix any validation or compliance issues before submission.</li>
              <li>
                Submit only when all mandatory fields are complete.
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">For Reviewers</h3>
            <p className="text-muted-foreground">
              At each phase, reviewers should leave precise comments linked to
              affected sections so submitters can resolve issues quickly.
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>
                <strong>Request Changes</strong> when content quality or
                completeness is not yet acceptable.
              </li>
              <li>
                <strong>Approve</strong> only after confirming section-level
                requirements are met.
              </li>
              <li>
                <strong>Reject</strong> only for major blocking issues and add
                clear rationale.
              </li>
              <li>Use comments for actionable, section-specific guidance.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">If You Are Blocked</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Image upload failed: use a clear JPG/PNG/WebP under 5 MB.</li>
              <li>Validation failed: open comments and fix highlighted fields.</li>
              <li>Cannot submit: complete required sections and resolve checks.</li>
              <li>
                Wrong access level: confirm you are in the correct role/account.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Review And Release Stages</h3>
            <p className="text-muted-foreground">
              Typical stages are preparation, departmental review, school
              approval, planning checks, corrections, and final publication
              handoff. Status badges on submissions show the current phase.
            </p>
          </section>

          {isAdmin && (
            <section className="space-y-2">
              <h3 className="font-semibold text-base">Admin Responsibilities</h3>
              <p className="text-muted-foreground">
                Create and manage user accounts, monitor stalled submissions, and
                guide teams through unresolved workflow blockers. Super Admins can
                activate/deactivate accounts and enforce quality checks.
              </p>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Need More Help?</h3>
            <p className="text-muted-foreground">
              Contact your bulletin coordinator or system administrator with the
              submission ID, current phase, and a short description of the issue.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
