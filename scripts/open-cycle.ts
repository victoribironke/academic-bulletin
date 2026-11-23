/**
 * Opens the real cycle (work order task A3): creates it active, closes any
 * other active cycle, and creates one empty draft per programme Heads of
 * Department see (66 after A5 and B18; hidden programmes get none).
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/open-cycle.ts --by <admin email> \
 *       [--name "2027-2031 Bulletin Development Cycle"] [--confirm]
 *
 * Without --confirm it is a dry run. Then, in order:
 *   npm run calendar:load -- --cycle "<name>" --confirm      (C1, sets the F0 date)
 *   npm run courses:prefill -- --file <02.xlsx> --cycle "<name>" --confirm   (E1)
 * Run it on the test site first, and on the live site only after A5.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const name = option("--name") ?? "2027-2031 Bulletin Development Cycle";
const by = option("--by")?.trim().toLowerCase();
const confirm = args.includes("--confirm");
if (!by) {
  console.error('Usage: npx tsx scripts/open-cycle.ts --by <admin email> [--name "<cycle name>"] [--confirm]');
  process.exit(1);
}

const databaseUrl = (process.env.DATABASE_URL_FILE
  ? readFileSync(process.env.DATABASE_URL_FILE, "utf8")
  : (process.env.DATABASE_URL ?? "")
).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
// The app's own database client reads this when first imported.
process.env.DATABASE_URL = databaseUrl;

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { openCycle, planOpenCycle } = await import("../lib/cycles/open");
  try {
    const actor = await prisma.user.findFirst({
      where: { email: { equals: by, mode: "insensitive" }, role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!actor) throw new Error(`${by} isn't an active Academic Planning admin on this site.`);

    const plan = await planOpenCycle(prisma, name);
    const newCount = plan.drafts.filter((draft) => draft.isNew).length;
    console.log(
      [
        `Cycle: ${name}: ${plan.cycle ? (plan.cycle.isActive ? "exists, active" : "exists, closed: will be reopened") : "will be created, active"}`,
        `Other active cycles to close: ${plan.closing.length ? plan.closing.map((cycle) => cycle.name).join(", ") : "none"}`,
        `Drafts to create: ${plan.drafts.length} (${plan.drafts.length - newCount} existing programmes, ${newCount} new); already there: ${plan.alreadyDrafted}`,
        `Hidden programmes (no draft): ${plan.hidden.length ? plan.hidden.map((item) => `${item.name} (${item.code})`).join(", ") : "none"}`,
        `Recorded as done by: ${actor.firstName} ${actor.lastName}`,
      ].join("\n"),
    );
    if (!confirm) {
      console.log("\nDry run: nothing changed. Add --confirm to open the cycle.");
      return;
    }
    const result = await openCycle(prisma, { name, actorId: actor.id });
    console.log(
      `\n${result.createdCycle ? "Created" : "Reopened"} ${name}; closed ${result.closed} other cycle(s); created ${result.draftsCreated} drafts.` +
        `\nNext: load the calendar (C1), then pre-fill the course lists (E1).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
