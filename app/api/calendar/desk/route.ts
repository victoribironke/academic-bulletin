import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canReadSubmission, isAdministrator, requireApiUser } from "@/lib/api-auth";
import {
  deskCountdown,
  extensionFor,
  loadActiveCycleCalendar,
  phaseCountdown,
  phaseList,
} from "@/lib/calendar/desk";
import { STATUS_LABELS } from "@/lib/submissions/phases";
import { calendarNow } from "@/lib/clock";
import { progressForDrafts } from "@/lib/submissions/section-status";
import type { SubmissionProgress } from "@/lib/submissions/progress";
import { headDeskStatus, programmeDeskStatuses, withDeskStatus } from "@/lib/desk/programme-status";
import type { DeskStatus } from "@/lib/desk/status";

/** Phases 1 to 5 run programme by programme; each has its own countdown. */
const PROGRAMME_PHASES = 5;

/**
 * GET /api/calendar/desk - The signed-in person's deadlines (tasks C2, C3):
 * their own countdown; for a Dean each programme in the school, and for a
 * Head each programme in the department; for Academic Planning every phase.
 * With ?submissionId=, that programme's countdown for its current phase.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const user = auth.user;
    const calendar = await loadActiveCycleCalendar();
    if (!calendar) return NextResponse.json({ cycle: null });
    // The test site's pretend clock, if a tester set one (section 13).
    const now = await calendarNow();

    const programmeCountdown = (programme: { id: string; departmentId: string }, currentPhase: number) =>
      currentPhase <= PROGRAMME_PHASES
        ? phaseCountdown(
            calendar,
            currentPhase,
            now,
            extensionFor(calendar, currentPhase, {
              programmeIds: [programme.id],
              departmentIds: [programme.departmentId],
            }),
          )
        : null;

    const submissionId = request.nextUrl.searchParams.get("submissionId");
    if (submissionId) {
      if (!(await canReadSubmission(user, submissionId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { id: true, cycleId: true, currentPhase: true, status: true, updatedAt: true, programme: { select: { id: true, departmentId: true } } },
      });
      if (!submission || submission.cycleId !== calendar.cycleId || submission.status === "APPROVED") {
        return NextResponse.json({ cycle: { id: calendar.cycleId, name: calendar.cycleName }, programme: null });
      }
      // T2: the programme's status by the section 7.2 rules, in Departmental Drafting.
      const status =
        submission.currentPhase === 1 ? (await programmeDeskStatuses(calendar, [submission], now)).get(submission.id) : null;
      return NextResponse.json({
        cycle: { id: calendar.cycleId, name: calendar.cycleName },
        programme: withDeskStatus(programmeCountdown(submission.programme, submission.currentPhase), status),
      });
    }

    const scope =
      user.role === "DEAN" && user.schoolId
        ? { programme: { department: { schoolId: user.schoolId } } }
        : (user.role === "HOD" || user.role === "PROGRAMME_COORDINATOR") && user.departmentId
          ? user.role === "PROGRAMME_COORDINATOR"
            ? { programmeId: { in: user.programmeIds } }
            : { programme: { departmentId: user.departmentId } }
          : null;
    const drafts = scope
      ? await prisma.submission.findMany({
          where: { cycleId: calendar.cycleId, ...scope },
          select: {
            id: true,
            currentPhase: true,
            status: true,
            updatedAt: true,
            programme: { select: { id: true, name: true, code: true, departmentId: true, isNew: true } },
          },
          orderBy: { programme: { name: "asc" } },
        })
      : null;
    // G1: each programme with its honest progress (G5).
    const progress = drafts ? await progressForDrafts(drafts.map((draft) => draft.id)) : new Map<string, SubmissionProgress>();
    // T2: each programme's status in Departmental Drafting (section 7.2).
    const statuses = drafts
      ? await programmeDeskStatuses(calendar, drafts.filter((draft) => draft.currentPhase === 1), now)
      : new Map<string, DeskStatus>();
    const programmes = drafts?.map((submission) => {
      const done = progress.get(submission.id);
      return {
        submissionId: submission.id,
        programme: { name: submission.programme.name, code: submission.programme.code, isNew: submission.programme.isNew },
        phase: submission.currentPhase,
        status: STATUS_LABELS[submission.status],
        countdown:
          submission.status === "APPROVED"
            ? null
            : withDeskStatus(programmeCountdown(submission.programme, submission.currentPhase), statuses.get(submission.id)),
        progress: done && {
          percentage: done.percentage,
          completedSections: done.completedSections,
          totalSections: done.totalSections,
          // The first section still to finish, to open the draft there.
          next: done.sections.find((section) => !section.complete)?.key ?? null,
        },
      };
    });

    return NextResponse.json({
      cycle: { id: calendar.cycleId, name: calendar.cycleName },
      desk:
        user.role === "HOD" || user.role === "PROGRAMME_COORDINATOR"
          ? withDeskStatus(
              deskCountdown(calendar, user, now),
              headDeskStatus(
                (drafts ?? [])
                  .filter((draft) => statuses.has(draft.id))
                  .map((draft) => ({ programme: draft.programme.name, status: statuses.get(draft.id)! })),
              ),
            )
          : deskCountdown(calendar, user, now),
      ...(programmes && { programmes }),
      ...(isAdministrator(user) && { phases: phaseList(calendar, now) }),
    });
  } catch (error) {
    console.error("Failed to work out deadlines:", error);
    return NextResponse.json({ error: "Failed to work out deadlines" }, { status: 500 });
  }
}
