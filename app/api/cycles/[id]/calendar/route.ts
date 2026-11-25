import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { readDeleteBody, requireDeleteConfirmation } from "@/lib/archive";
import {
  CalendarEditError,
  addClinic,
  addHoliday,
  addQuietPeriod,
  calendarForEditing,
  changeCheckpoint,
  changePhaseDates,
  grantExtension,
  removeCalendarItem,
  setQuietHours,
} from "@/lib/calendar/edit";

type RouteParams = { params: Promise<{ id: string }> };

const failed = (error: unknown, what: string) => {
  if (error instanceof CalendarEditError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`Failed to ${what}:`, error);
  return NextResponse.json({ error: `Failed to ${what}` }, { status: 500 });
};

/** GET: the cycle's calendar for the settings screen (task C4). */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const calendar = await calendarForEditing(id);
    if (!calendar) return NextResponse.json({ error: "Review cycle not found" }, { status: 404 });
    return NextResponse.json(calendar);
  } catch (error) {
    return failed(error, "load the calendar");
  }
}

/**
 * POST: one change to the calendar (task C4), logged, with the people a date
 * change affects told by email: { action: "phase" | "checkpoint" | "holiday"
 * | "quiet-period" | "quiet-hours" | "clinic" | "extension", ... }.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const cycle = await calendarForEditing(id);
    if (!cycle) return NextResponse.json({ error: "Review cycle not found" }, { status: 404 });
    if (cycle.cycle.archived) return NextResponse.json({ error: "An archived cycle's calendar can't change." }, { status: 409 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = auth.user.id;
    let result: { told?: number } | void;
    switch (body.action) {
      case "phase":
        result = await changePhaseDates(id, Number(body.phase), body, actor);
        break;
      case "checkpoint":
        result = await changeCheckpoint(id, String(body.code ?? ""), body, actor);
        break;
      case "holiday":
        result = await addHoliday(id, body, actor);
        break;
      case "quiet-period":
        result = await addQuietPeriod(id, body, actor);
        break;
      case "quiet-hours":
        result = await setQuietHours(id, body, actor);
        break;
      case "clinic":
        result = await addClinic(id, body, actor);
        break;
      case "extension":
        result = await grantExtension(id, body, actor);
        break;
      default:
        return NextResponse.json({ error: "Choose what to change." }, { status: 400 });
    }
    return NextResponse.json({ ...(result ?? {}), calendar: await calendarForEditing(id) });
  } catch (error) {
    return failed(error, "change the calendar");
  }
}

/** DELETE: removes a holiday, quiet period, clinic or extension, after DELETE is typed (Q7). */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await readDeleteBody(request.clone());
    const unconfirmed = await requireDeleteConfirmation(request, "calendar entry");
    if (unconfirmed) return unconfirmed;
    await removeCalendarItem(id, body.kind, body.itemId, auth.user.id);
    return NextResponse.json({ calendar: await calendarForEditing(id) });
  } catch (error) {
    return failed(error, "remove the calendar entry");
  }
}
