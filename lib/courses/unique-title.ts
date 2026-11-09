/** Key used to compare course titles: case and spacing don't count. */
export function titleKey(title: string) {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Returns a title not already in `taken`. A clash gets the course code
 * appended, e.g. "Nigerian Peoples and Culture (GST 113)".
 */
export function uniqueTitle(title: string, code: string, taken: Set<string>) {
  if (!taken.has(titleKey(title))) return title;
  const withCode = `${title} (${code})`;
  if (!taken.has(titleKey(withCode))) return withCode;
  let n = 2;
  while (taken.has(titleKey(`${withCode} ${n}`))) n += 1;
  return `${withCode} ${n}`;
}
