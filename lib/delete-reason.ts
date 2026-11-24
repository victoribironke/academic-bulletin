/**
 * Work order Q7, Appendix D: deleting something another unit owns (for
 * example a DAP admin removing a department's course row) also asks for a
 * short reason, which goes in the activity log.
 *
 * Shared by the server and the pages, so it has no server-only imports.
 */
export const DELETE_REASON_LENGTH = { min: 10, max: 500 } as const;

type Person = { role: string; departmentId: string | null };

/**
 * True unless the person is the Head or a programme coordinator of the
 * department that owns the row: DAP admins, Super Administrators, Deans and
 * desk owners give a reason.
 */
export function deleteNeedsReason(person: Person, ownerDepartmentId: string): boolean {
  const ownsIt =
    (person.role === "HOD" || person.role === "PROGRAMME_COORDINATOR") &&
    person.departmentId === ownerDepartmentId;
  return !ownsIt;
}

/** The reason, tidied, or null when there is none. */
export function cleanDeleteReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  const text = reason.trim().replace(/\s+/g, " ");
  return text || null;
}

/** What is wrong with the reason, or null when it will do. */
export function deleteReasonProblem(reason: unknown): string | null {
  const text = cleanDeleteReason(reason) ?? "";
  if (text.length < DELETE_REASON_LENGTH.min) {
    return `Say why you are deleting it, in at least ${DELETE_REASON_LENGTH.min} characters. It goes in the activity log.`;
  }
  if (text.length > DELETE_REASON_LENGTH.max) {
    return `Keep the reason under ${DELETE_REASON_LENGTH.max} characters.`;
  }
  return null;
}
