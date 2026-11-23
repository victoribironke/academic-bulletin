/**
 * Imports the roster (work order task D2): Deans, Heads of Department,
 * programme coordinators, DAP officers and the General Education desk, from
 * the D1 template.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/import-roster.ts "<roster.xlsx>" [--report <report.md>] [--confirm]
 *
 * Without --confirm it is a dry run: it lists every person and every problem
 * by sheet and row, and changes nothing. With --confirm it imports everyone
 * in one transaction, but only when there are no problems. It sends no email
 * (invitations are task D3). Run it on the test site first.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { applyRoster, describeRosterPlan, planRoster } from "../lib/people/roster";
import { readRosterWorkbook } from "../lib/people/read-roster";
import { loadCodeLookups } from "../lib/units/code-aliases";

const args = process.argv.slice(2);
const reportIndex = args.indexOf("--report");
const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
const rosterPath = args.find((arg, index) => !arg.startsWith("--") && (reportIndex < 0 || index !== reportIndex + 1));
const confirm = args.includes("--confirm");
if (!rosterPath) {
  console.error('Usage: npx tsx scripts/import-roster.ts "<roster.xlsx>" [--report <file.md>] [--confirm]');
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
  const rows = await readRosterWorkbook(rosterPath!);
  const [schools, departments, programmes, users, lookups] = await Promise.all([
    prisma.school.findMany({ select: { id: true, code: true, name: true } }),
    prisma.department.findMany({ select: { id: true, code: true, name: true, schoolId: true } }),
    prisma.programme.findMany({ select: { id: true, code: true, name: true, departmentId: true } }),
    prisma.user.findMany({
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, isActive: true,
        title: true, whatsapp: true, isActing: true, schoolId: true, departmentId: true,
        programmeAssignments: { select: { programmeId: true } },
      },
    }),
    loadCodeLookups(prisma),
  ]);
  const plan = planRoster(rows, {
    schools,
    departments,
    programmes,
    users: users.map(({ programmeAssignments, ...user }) => ({
      ...user,
      programmeIds: programmeAssignments.map((assignment) => assignment.programmeId),
    })),
    lookups,
  });
  const when = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", dateStyle: "long", timeStyle: "short" }).format(new Date());
  const report = describeRosterPlan(plan, `Roster import: ${confirm && plan.problems.length === 0 ? "imported" : "dry run"} on ${host}, ${when} WAT`);
  if (reportPath) writeFileSync(reportPath, report);
  console.log(report);

  if (!confirm) {
    console.log(plan.problems.length ? "\nDry run only. Fix the problems above, then run again." : "\nDry run only. Run again with --confirm to import.");
    process.exitCode = plan.problems.length ? 1 : 0;
    return;
  }
  if (plan.problems.length > 0) {
    console.error("\nNothing was imported: fix the problems above first.");
    process.exitCode = 1;
    return;
  }
  const result = await prisma.$transaction((tx) => applyRoster(tx, plan, null), { timeout: 120_000 });
  console.log(`\nImported: ${result.created} added, ${result.updated} updated. No email was sent.`);
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
