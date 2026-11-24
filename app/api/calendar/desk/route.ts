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
        select: { cycleId: true, currentPhase: true, status: true, programme: { select: { id: true, departmentId: true } } },
      });
      if (!submission || submission.cycleId !== calendar.cycleId || submission.status === "APPROVED") {
        return NextResponse.json({ cycle: { id: calendar.cycleId, name: calendar.cycleName }, programme: null });
      }
      return NextResponse.json({
        cycle: { id: calendar.cycleId, name: calendar.cycleName },
        programme: programmeCountdown(submission.programme, submission.currentPhase),
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
    const programmes = scope
      ? (
          await prisma.submission.findMany({
            where: { cycleId: calendar.cycleId, ...scope },
            select: {
              id: true,
              currentPhase: true,
              status: true,
              programme: { select: { id: true, name: true, code: true, departmentId: true, isNew: true } },
            },
            orderBy: { programme: { name: "asc" } },
          })
        ).map((submission) => ({
          submissionId: submission.id,
          programme: { name: submission.programme.name, code: submission.programme.code, isNew: submission.programme.isNew },
          phase: submission.currentPhase,
          status: STATUS_LABELS[submission.status],
          countdown: submission.status === "APPROVED" ? null : programmeCountdown(submission.programme, submission.currentPhase),
        }))
      : undefined;

    return NextResponse.json({
      cycle: { id: calendar.cycleId, name: calendar.cycleName },
      desk: deskCountdown(calendar, user, now),
      ...(programmes && { programmes }),
      ...(isAdministrator(user) && { phases: phaseList(calendar, now) }),
    });
  } catch (error) {
    console.error("Failed to work out deadlines:", error);
    return NextResponse.json({ error: "Failed to work out deadlines" }, { status: 500 });
  }
}
