/**
 * Task E2: fills each draft's narrative sections from the 2023-2027 bulletin
 * (data/bulletin/baseline-2023-2027.json) for the Head of Department to
 * review: vision, mission, philosophy, objectives, unique features,
 * employability skills, UTME, Direct Entry and Transfer admission,
 * graduation requirements and programme regulations. Every field it fills
 * shows "From the 2023-2027 bulletin: please review" until the Head edits it
 * or marks it reviewed (rule V18).
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/carry-2023-2027-text.ts --cycle "<cycle name or id>" \
 *       --by <admin email> [--programme <code>] [--report <file.md>] [--confirm]
 *
 * A dry run unless --confirm. It only fills fields a draft has left empty:
 * nothing a Head has written is changed, so running it again is safe.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const cycleArg = option("--cycle");
const by = option("--by")?.trim().toLowerCase();
const onlyProgramme = option("--programme")?.trim().toUpperCase();
const reportPath = option("--report");
const confirm = args.includes("--confirm");
if (!cycleArg || !by) {
  console.error('Usage: npx tsx scripts/carry-2023-2027-text.ts --cycle "<cycle name or id>" --by <admin email> [--programme <code>] [--report <file.md>] [--confirm]');
  process.exit(1);
}

const databaseUrl = (process.env.DATABASE_URL_FILE ? readFileSync(process.env.DATABASE_URL_FILE, "utf8") : (process.env.DATABASE_URL ?? "")).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl;

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { baselineFor, carryPlan } = await import("../lib/bulletin/baseline");
  const { carriedField } = await import("../lib/bulletin/carried-fields");
  const { recordActivity } = await import("../lib/activity-log");
  type Prisma = import("@prisma/client").Prisma.SubmissionContentUncheckedUpdateInput;

  try {
    const actor = await prisma.user.findUnique({ where: { email: by }, select: { id: true, role: true } });
    if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) throw new Error(`${by} is not an administrator.`);
    const cycle = await prisma.reviewCycle.findFirst({
      where: { OR: [{ id: cycleArg }, { name: cycleArg }] },
      select: { id: true, name: true, archivedAt: true },
    });
    if (!cycle) throw new Error(`No cycle "${cycleArg}".`);
    if (cycle.archivedAt) throw new Error(`${cycle.name} is archived.`);

    const drafts = await prisma.submission.findMany({
      where: { cycleId: cycle.id, ...(onlyProgramme ? { programme: { code: onlyProgramme } } : {}) },
      select: { id: true, status: true, currentPhase: true, programme: { select: { code: true, name: true } }, content: true },
      orderBy: { programme: { code: "asc" } },
    });

    const lines: string[] = [];
    const filled: string[] = [];
    const kept: string[] = [];
    const none: string[] = [];
    let fieldCount = 0;
    for (const draft of drafts) {
      const baseline = baselineFor(draft.programme.code);
      if (!baseline || Object.keys(baseline.fields).length === 0) {
        none.push(`${draft.programme.code} ${draft.programme.name}`);
        continue;
      }
      const content = draft.content as Record<string, unknown> | null;
      const plan = carryPlan(baseline, content);
      const writable = draft.currentPhase === 1 && (draft.status === "DRAFT" || draft.status === "CORRECTIONS_REQUIRED");
      const labels = plan.carried.map((key) => carriedField(key)?.label ?? key);
      if (plan.carried.length === 0) {
        kept.push(`${draft.programme.code} ${draft.programme.name}`);
        continue;
      }
      if (!writable) {
        lines.push(`| ${draft.programme.code} | ${draft.programme.name} | not filled: the draft is at Phase ${draft.currentPhase} (${draft.status}) |`);
        continue;
      }
      fieldCount += plan.carried.length;
      filled.push(draft.programme.code);
      lines.push(`| ${draft.programme.code} | ${draft.programme.name} | ${labels.join(", ")} |`);
      if (confirm) {
        const carried = [...new Set([...((draft.content?.carriedFields as string[] | undefined) ?? []), ...plan.carried])];
        const data = { ...plan.patch, carriedFields: carried } as Prisma;
        await prisma.submissionContent.upsert({
          where: { submissionId: draft.id },
          update: data,
          create: { submissionId: draft.id, ...(data as object) },
        });
        await recordActivity({
          actorId: actor.id,
          action: "CARRIED_TEXT_FILLED",
          entityType: "SUBMISSION",
          entityId: draft.id,
          description: `Filled ${labels.length} section${labels.length === 1 ? "" : "s"} from the 2023-2027 bulletin for the Head of Department to review: ${labels.join(", ")}.`,
          metadata: { fields: plan.carried, file: baseline.file },
        });
      }
    }

    const report = [
      `# E2: narrative sections from the 2023-2027 bulletin (${confirm ? "applied" : "dry run"})`,
      "",
      `Cycle: ${cycle.name}. ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Source: data/bulletin/baseline-2023-2027.json (the frozen 2023-2027 files, staff lists left out).`,
      "",
      `- Drafts ${confirm ? "filled" : "to fill"}: ${filled.length}, with ${fieldCount} fields marked "From the 2023-2027 bulletin: please review".`,
      `- Drafts whose fields are all already written: ${kept.length}${kept.length ? ` (${kept.join("; ")})` : ""}.`,
      `- Drafts with no 2023-2027 text to carry (new programmes, or a 2023-2027 file without these sections): ${none.length}.`,
      "",
      "Only empty fields are filled; nothing a Head has written is changed.",
      "",
      "| Programme | Name | Fields |",
      "|---|---|---|",
      ...lines,
      "",
      none.length ? `No 2023-2027 text: ${none.join("; ")}.` : "",
      "",
    ].join("\n");
    if (reportPath) writeFileSync(reportPath, report);
    console.log(report);
    if (!confirm) console.log("Dry run: nothing changed. Add --confirm to fill the drafts.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
