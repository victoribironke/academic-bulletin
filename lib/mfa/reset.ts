/**
 * Resetting someone's two-step verification, shared by the Users page
 * (app/api/users/[id]/mfa) and the command-line script for when no other
 * Super Admin can do it (scripts/reset-two-step.ts).
 */
import type { Prisma } from "@prisma/client";
import { recordActivity } from "@/lib/activity-log";

export type ResetTarget = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mfaEnabledAt: Date | null;
};

/**
 * Clears the authenticator secret and recovery codes, and deletes every
 * accepted code, which ends the person's admin sessions at once. Logged.
 * Returns how many sessions were ended.
 */
export async function resetTwoStepVerification(
  tx: Prisma.TransactionClient,
  target: ResetTarget,
  opts: { actorId: string | null; via: "users_page" | "command_line" },
): Promise<number> {
  await tx.user.update({
    where: { id: target.id },
    data: { mfaSecret: null, mfaEnabledAt: null, mfaLastUsedStep: null },
  });
  await tx.mfaRecoveryCode.deleteMany({ where: { userId: target.id } });
  const ended = await tx.mfaVerification.deleteMany({ where: { userId: target.id } });

  const name = `${target.firstName} ${target.lastName}`;
  await recordActivity(
    {
      actorId: opts.actorId,
      action: "MFA_RESET",
      entityType: "USER",
      entityId: target.id,
      description:
        opts.via === "command_line"
          ? `Reset ${name}'s two-step verification from the command line. They'll set up their authenticator app again at their next sign-in.`
          : `Reset ${name}'s two-step verification. They'll set up their authenticator app again at their next sign-in.`,
      metadata: {
        email: target.email,
        wasEnabledAt: target.mfaEnabledAt?.toISOString() ?? null,
        endedSessions: ended.count,
        via: opts.via,
      },
    },
    tx,
  );
  return ended.count;
}
