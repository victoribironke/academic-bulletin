/**
 * Resets someone's two-step verification from the command line, for when no
 * other Super Administrator can do it from the Users page (for example, the
 * only Super Admin has lost their phone and their recovery codes).
 *
 *   npm run mfa:reset -- someone@babcock.edu.ng
 *
 * Needs DATABASE_URL for the live database (in .env.local). It shows who the
 * account belongs to and asks you to type the email address again first.
 * The reset is recorded in the Activity Log.
 */
import "../lib/load-env";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import prisma from "../lib/prisma";
import { resetTwoStepVerification } from "../lib/mfa/reset";
import { normalizeEmail } from "../lib/sign-in-access";

async function main() {
  const email = normalizeEmail(process.argv[2]);
  if (!email) {
    console.error("Usage: npm run mfa:reset -- someone@babcock.edu.ng");
    process.exitCode = 1;
    return;
  }

  const target = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      mfaEnabledAt: true,
      mfaSecret: true,
    },
  });
  if (!target) {
    console.error(`No user has the email address ${email}.`);
    process.exitCode = 1;
    return;
  }
  if (!target.mfaEnabledAt && !target.mfaSecret) {
    console.log(`${target.firstName} ${target.lastName} hasn't set up two-step verification. Nothing to reset.`);
    return;
  }

  console.log(`\n${target.firstName} ${target.lastName} (${target.email}, ${target.role})`);
  console.log(
    target.mfaEnabledAt
      ? `Two-step verification on since ${target.mfaEnabledAt.toISOString()}.`
      : "Two-step verification set-up started but not finished.",
  );
  console.log(
    "Resetting stops their authenticator app and recovery codes working and ends their admin sessions.\n",
  );

  const prompt = createInterface({ input: stdin, output: stdout });
  const typed = await prompt.question("Type the email address again to reset: ");
  prompt.close();
  if (normalizeEmail(typed) !== target.email) {
    console.error("That doesn't match. Nothing was changed.");
    process.exitCode = 1;
    return;
  }

  const ended = await prisma.$transaction((tx) =>
    resetTwoStepVerification(tx, target, { actorId: null, via: "command_line" }),
  );
  console.log(
    `Done. ${ended} session${ended === 1 ? "" : "s"} ended. They'll set up the app again at their next sign-in.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
