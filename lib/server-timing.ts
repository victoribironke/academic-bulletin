/**
 * Server-Timing for the routes every page calls (task S1), so the time spent
 * on sign-in checks and database work shows in the browser's network panel.
 * Durations only; nothing about the person or the data.
 */
export function serverTimer() {
  const start = performance.now();
  let last = start;
  const parts: string[] = [];
  return {
    /** Records the time since the previous mark under this name. */
    mark(name: string) {
      const now = performance.now();
      parts.push(`${name};dur=${(now - last).toFixed(1)}`);
      last = now;
    },
    /** The header value, with the total. */
    header(): string {
      return [...parts, `total;dur=${(performance.now() - start).toFixed(1)}`].join(", ");
    },
  };
}
