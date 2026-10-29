/**
 * GRACE checks remain available, but they are temporarily advisory unless the
 * deployment explicitly enables this gate.
 */
export const GRACE_SUBMISSION_REQUIRED =
  process.env.NEXT_PUBLIC_REQUIRE_GRACE_FOR_SUBMISSION === "true";
