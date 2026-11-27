/** Task W3: the fields of a named elective group, as a request sends them. */
export const MAX_GROUP_NAME = 80;

export function readGroupFields(
  body: unknown,
  { requireAll }: { requireAll: boolean },
): { ok: true; name?: string; chooseUnits?: number } | { ok: false; message: string } {
  const value = (body ?? {}) as { name?: unknown; chooseUnits?: unknown };
  const name = typeof value.name === "string" ? value.name.trim().replace(/\s+/g, " ") : undefined;
  if (requireAll || value.name !== undefined) {
    if (!name || name.length > MAX_GROUP_NAME) {
      return { ok: false, message: `Give the group a name of up to ${MAX_GROUP_NAME} characters, for example "300 level electives".` };
    }
  }
  let chooseUnits: number | undefined;
  if (requireAll || value.chooseUnits !== undefined) {
    const number = typeof value.chooseUnits === "number" ? value.chooseUnits : Number(value.chooseUnits);
    if (!Number.isInteger(number) || number < 1 || number > 60) {
      return { ok: false, message: "Say how many units a student chooses from the group: a whole number from 1 to 60." };
    }
    chooseUnits = number;
  }
  return { ok: true, name, chooseUnits };
}
