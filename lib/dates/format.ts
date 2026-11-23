/**
 * One date format for the whole app (work order task Q1): "November 26,
 * 2026", in Lagos time, on every screen, email and export. Never
 * "11/2/2026" or "2 Nov 2026".
 */

const TIME_ZONE = "Africa/Lagos";
type DateInput = Date | string | number;

const DATE = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "long", day: "numeric", year: "numeric" });
const DATE_WITH_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });

const asDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));
const lowerMeridiem = (text: string) => text.replace(/\s?([AP])M\b/g, (_, letter: string) => ` ${letter.toLowerCase()}m`);

/** "November 26, 2026". */
export function formatDate(value: DateInput): string {
  return DATE.format(asDate(value));
}

/** "Thursday, November 26, 2026". */
export function formatDateWithDay(value: DateInput): string {
  return DATE_WITH_DAY.format(asDate(value));
}

/** "8:00 am". */
export function formatTime(value: DateInput): string {
  return lowerMeridiem(TIME.format(asDate(value)));
}

/** "November 26, 2026, 8:00 am". */
export function formatDateTime(value: DateInput): string {
  return `${formatDate(value)}, ${formatTime(value)}`;
}
