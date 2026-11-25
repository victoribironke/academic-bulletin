import { describe, expect, it } from "vitest";
import {
  CLINICS_END,
  CLINIC_TITLE,
  clinicSessions,
  describeClinic,
  isSafeJoinUrl,
  readClinicInput,
  type ClinicSlot,
} from "@/lib/calendar/clinic-sessions";

// Task H8: the clinics for Heads of Department, worked out without a database.

const slot = (id: string, weekday: ClinicSlot["weekday"], startTime: string, untilDate = CLINICS_END): ClinicSlot => ({
  id,
  weekday,
  startTime,
  minutes: 30,
  title: CLINIC_TITLE,
  joinUrl: `https://meet.example.org/${id}`,
  untilDate,
});
const tuesday = slot("tue", "TUE", "14:00");
const thursday = slot("thu", "THU", "11:00");
const noDaysOff = { holidays: [], breaks: [] };
// Wednesday, November 25, 2026, in West Africa Time (UTC+1).
const at = (wat: string) => new Date(`${wat}+01:00`);

describe("describeClinic", () => {
  it("says when the clinic runs each week", () => {
    expect(describeClinic(tuesday)).toBe("Every Tuesday, 2:00 pm to 2:30 pm");
    expect(describeClinic({ weekday: "THU", startTime: "11:45", minutes: 30 })).toBe("Every Thursday, 11:45 am to 12:15 pm");
  });
});

describe("clinicSessions", () => {
  it("lists the next sessions of every clinic, soonest first", () => {
    const sessions = clinicSessions([tuesday, thursday], noDaysOff, at("2026-11-25T10:00:00"));
    expect(sessions.map((session) => [session.clinicId, session.day, session.time, session.status])).toEqual([
      ["thu", "Tomorrow", "11:00 am to 11:30 am", "LATER"],
      ["tue", "Tuesday, December 1", "2:00 pm to 2:30 pm", "LATER"],
    ]);
    expect(sessions[0].startsAt).toBe("2026-11-26T10:00:00.000Z");
    expect(sessions[0].joinUrl).toBe("https://meet.example.org/thu");
  });

  it("marks a session starting soon or on now, and drops one that has ended", () => {
    expect(clinicSessions([thursday], noDaysOff, at("2026-11-26T10:50:00"))[0]).toMatchObject({ day: "Today", status: "SOON" });
    expect(clinicSessions([thursday], noDaysOff, at("2026-11-26T11:10:00"))[0]).toMatchObject({ day: "Today", status: "ON_NOW" });
    expect(clinicSessions([thursday], noDaysOff, at("2026-11-26T11:30:00"))[0]).toMatchObject({ date: "2026-12-03", status: "LATER" });
  });

  it("skips holidays and the Christmas break, and stops at the last day", () => {
    const daysOff = { holidays: ["2026-11-26"], breaks: [{ from: "2026-12-19", to: "2027-01-04" }] };
    expect(clinicSessions([thursday], daysOff, at("2026-11-25T10:00:00")).map((session) => session.date)).toEqual(["2026-12-03", "2026-12-10"]);
    const afterBreak = clinicSessions([tuesday], daysOff, at("2026-12-18T09:00:00"));
    expect(afterBreak.map((session) => session.day)).toEqual(["Tuesday, January 5, 2027", "Tuesday, January 12, 2027"]);
    expect(clinicSessions([slot("short", "TUE", "14:00", "2026-12-01")], noDaysOff, at("2026-11-25T10:00:00"), { limit: 5 }).map((session) => session.date)).toEqual([
      "2026-12-01",
    ]);
    expect(clinicSessions([tuesday], noDaysOff, at("2027-01-30T09:00:00"))).toEqual([]);
  });
});

describe("readClinicInput", () => {
  const today = "2026-11-25";
  const good = { weekday: "TUE", startTime: "14:00", joinUrl: "https://teams.microsoft.com/l/meetup-join/abc" };

  it("fills in the name, the 30 minutes and the last day", () => {
    expect(readClinicInput(good, today)).toEqual({
      value: { title: CLINIC_TITLE, weekday: "TUE", startTime: "14:00", minutes: 30, joinUrl: good.joinUrl, untilDate: CLINICS_END },
    });
  });

  it("keeps clinics off the Sabbath", () => {
    expect(readClinicInput({ ...good, weekday: "SAT" }, today)).toEqual({ error: "Saturday is the Sabbath; choose another day." });
    expect(readClinicInput({ ...good, weekday: "FRI", startTime: "17:45" }, today)).toEqual({
      error: "The Sabbath starts on Friday evening; a Friday clinic must end by 6:00 pm.",
    });
    expect("value" in readClinicInput({ ...good, weekday: "FRI", startTime: "17:30" }, today)).toBe(true);
  });

  it("takes only a plain https joining link", () => {
    for (const joinUrl of ["http://meet.example.org/x", "javascript:alert(1)", "https://user:secret@meet.example.org/x", "meet.example.org/x", ""]) {
      expect(readClinicInput({ ...good, joinUrl }, today)).toEqual({ error: "Paste the meeting's joining link; it starts with https://." });
    }
    expect(isSafeJoinUrl("https://zoom.us/j/123?pwd=abc")).toBe(true);
  });

  it("says what to fix in the time, length and last day", () => {
    expect(readClinicInput({ ...good, startTime: "2pm" }, today)).toEqual({ error: "Give the start time as hours and minutes, for example 14:00." });
    expect(readClinicInput({ ...good, minutes: 10 }, today)).toEqual({ error: "A clinic lasts between 15 and 120 minutes." });
    expect(readClinicInput({ ...good, untilDate: "2026-11-24" }, today)).toEqual({ error: "The last day can't be in the past." });
    expect(readClinicInput({ ...good, weekday: "" }, today)).toEqual({ error: "Choose the day of the week the clinic runs." });
  });
});
