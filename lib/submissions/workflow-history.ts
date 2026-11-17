import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** A record whose deletion would take bulletins, and their ledger, with it. */
export type WorkflowHistoryScope =
  | { submissionId: string }
  | { programmeId: string }
  | { departmentId: string }
  | { schoolId: string };

const REFUSAL: Record<string, string> = {
  submissionId: "This bulletin has workflow history",
  programmeId: "This programme has bulletins with workflow history",
  departmentId: "This department has bulletins with workflow history",
  schoolId: "This school has bulletins with workflow history",
};

/**
 * The workflow ledger is permanent, and the database refuses to delete its
 * rows (ledger guards). A delete that would cascade into it is refused here
 * first, with a reason the person can act on, instead of failing.
 * Returns the 409 response to send, or null when the delete may go ahead.
 */
export async function workflowHistoryConflict(
  scope: WorkflowHistoryScope,
): Promise<NextResponse | null> {
  const submission =
    "submissionId" in scope
      ? { id: scope.submissionId }
      : "programmeId" in scope
        ? { programmeId: scope.programmeId }
        : "departmentId" in scope
          ? { programme: { departmentId: scope.departmentId } }
          : { programme: { department: { schoolId: scope.schoolId } } };

  const entry = await prisma.phaseTransition.findFirst({
    where: { submission },
    select: { id: true },
  });
  if (!entry) return null;

  return NextResponse.json(
    {
      error: `${REFUSAL[Object.keys(scope)[0]]}, so it can't be deleted.`,
      code: "HAS_WORKFLOW_HISTORY",
    },
    { status: 409 },
  );
}
