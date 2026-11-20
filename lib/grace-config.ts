import type { UserRole } from "@prisma/client";

/** GRACE compliance is an institutional submission requirement. */
export const GRACE_SUBMISSION_REQUIRED = true;

/**
 * Who may approve a bulletin on although some of its GRACE results haven't
 * passed for the text as it stands (lib/submissions/grace-gate.ts). Every
 * override needs a written reason and is kept in the workflow ledger with the
 * results it covered. Default: Super Admin only, pending the University's
 * sign-off; change the list here and push.
 */
export const GRACE_OVERRIDE_ROLES: readonly UserRole[] = ["SUPER_ADMIN"];

/** Length of the reason an override must give, in characters. */
export const GRACE_OVERRIDE_REASON_LENGTH = { min: 20, max: 500 } as const;
