/**
 * Loads a cycle's calendar (work order task C1) from settings in the shape of
 * section 4.6: phases, checkpoints, holidays, quiet periods, working week and
 * the date "Submit to School" opens (F0).
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/load-calendar.ts --cycle "<cycle name or id>" \
 *       [--file data/calendar/2027-2031.json] [--confirm]
 *
 * Without --confirm it is a dry run: it checks the file and shows what would
 * be loaded. Running it again replaces the calendar with the file's; DAP's
 * extensions are never touched. Run it on the test site first.
 */
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { formatLongDate } from "../lib/calendar/dates";
import { type CalendarSettings, applyCalendarSettings, checkCalendarSettings } from "../lib/calendar/settings";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const cycleArg = option("--cycle");
const file = option("--file") ?? "data/calendar/2027-2031.json";
const confirm = args.includes("--confirm");
if (!cycleArg) {
  console.error('Usage: npx tsx scripts/load-calendar.ts --cycle "<cycle name or id>" [--file <json>] [--confirm]');
  process.exit(1);
}

const settings = JSON.parse(readFileSync(file, "utf8")) as CalendarSettings;
const problems = checkCalendarSettings(settings);
if (problems.length > 0) {
  console.error(`The calendar file has problems:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const databaseUrl = (process.env.DATABASE_URL_FILE
  ? readFileSync(process.env.DATABASE_URL_FILE, "utf8")
  : process.env.DATABASE_URL ?? ""
).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
const host = new URL(databaseUrl).hostname;
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: /^(localhost|127\.0\.0\.1)$/.test(host) ? false : { rejectUnauthorized: false },
  max: 1,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const cycle = await prisma.reviewCycle.findFirst({
    where: { OR: [{ id: cycleArg }, { name: cycleArg }] },
    select: { id: true, name: true },
  });
  if (!cycle) throw new Error(`No cycle is called "${cycleArg}" on ${host}.`);

  console.log(`Calendar for "${cycle.name}" on ${host}${confirm ? "" : " (dry run: nothing is changed)"}`);
  for (const phase of settings.phases) {
    const due = phase.dueAt ?? phase.baselineDueAt;
    console.log(`  Phase ${phase.no}, ${phase.name}: ${due ? `due ${formatLongDate(due)}` : "dates from the Senate vote"}`);
  }
  console.log(`  ${settings.checkpoints.length} checkpoints, ${settings.cycle.holidays?.length ?? 0} holidays, ${settings.cycle.quietPeriods?.length ?? 0} quiet periods`);
  const open = settings.checkpoints.find((checkpoint) => checkpoint.code === "SUBMIT_OPEN");
  if (open) console.log(`  Submit to School opens ${formatLongDate(open.dueAt)} (F0)`);
  if (!confirm) {
    console.log("\nDry run only. Run again with --confirm to load it.");
    return;
  }

  const loaded = await prisma.$transaction(async (tx) => {
    const result = await applyCalendarSettings(tx, cycle.id, settings);
    await tx.activityLog.create({
      data: {
        action: "CYCLE_CALENDAR_LOADED",
        entityType: "REVIEW_CYCLE",
        entityId: cycle.id,
        description: `Loaded the calendar for ${cycle.name}: ${result.phases} phases, ${result.checkpoints} checkpoints, ${result.holidays} holidays.`,
        metadata: { file, ...result },
      },
    });
    return result;
  });
  console.log(`\nLoaded: ${loaded.phases} phases, ${loaded.checkpoints} checkpoints, ${loaded.holidays} holidays, ${loaded.quietPeriods} quiet periods.`);
}

main()
  .catch((error) => {
    console.error(`Stopped, nothing changed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
