/**
 * Task U6: the practice programme's API, in the browser. While the practice
 * page is open, window.fetch goes through here: a request that names a
 * practice record (an id starting "practice-run-") is answered from the
 * practice state kept in this browser's storage; every other request goes
 * to the server as usual. The server has no practice records, so nothing a
 * practice action does can reach the database, the activity log, email or
 * anyone's queue.
 */
import { mentionsPractice } from "@/lib/practice/ids";
import { startingPracticeState, type PracticeState } from "@/lib/practice/fixture";
import { handlePracticeRequest, type PracticeViewer } from "@/lib/practice/handlers";

const STORAGE_PREFIX = "abrs:practice:";

/** Sent when a practice action would have reached someone: the page says it didn't. */
export const PRACTICE_NOTE_EVENT = "practice:note";

const memory = new Map<string, PracticeState>();

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadPractice(userId: string, role: string = "HOD"): PracticeState {
  const cached = memory.get(userId);
  if (cached) return cached;
  let state: PracticeState | null = null;
  try {
    const saved = window.localStorage.getItem(storageKey(userId));
    const parsed = saved ? (JSON.parse(saved) as PracticeState) : null;
    if (parsed && parsed.version === 1) state = parsed;
  } catch {
    state = null;
  }
  state ??= startingPracticeState(role);
  memory.set(userId, state);
  return state;
}

export function savePractice(userId: string, state: PracticeState) {
  memory.set(userId, state);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Private windows may refuse storage: the practice then lasts until reload.
  }
}

export function resetPractice(userId: string) {
  memory.delete(userId);
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing kept, nothing to clear.
  }
}

async function bodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (init?.body !== undefined && init.body !== null) {
    return typeof init.body === "string" ? init.body : null;
  }
  if (input instanceof Request) return input.clone().text().catch(() => null);
  return null;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * On the practice page, a change sent to the server without a practice id
 * (a background GRACE run, say) is answered here too: the practice page
 * never writes to the server. Signing out and the assistant still work.
 */
function practicePageWrite(method: string, target: URL): boolean {
  if (method === "GET" || method === "HEAD") return false;
  if (target.origin !== window.location.origin || !target.pathname.startsWith("/api/")) return false;
  if (!window.location.pathname.startsWith("/practice")) return false;
  return !/^\/api\/(auth|agent)\//.test(target.pathname);
}

let installed: { original: typeof fetch; count: number } | null = null;

// The practice page waits for the practice API before it shows the draft.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function subscribePracticeApi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function practiceApiInstalled(): boolean {
  return installed !== null;
}

/**
 * Routes practice requests to the practice API until the returned function
 * is called. A request with a file (an image upload) for a practice record is
 * answered too, so no upload leaves the browser.
 */
export function installPracticeApi(viewer: PracticeViewer): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (!installed) {
    const original = window.fetch.bind(window);
    installed = { original, count: 0 };
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const text = await bodyText(input, init);
      const hasFile = init?.body instanceof FormData;
      const formMentions = hasFile && [...(init!.body as FormData).values()].some((value) => typeof value === "string" && mentionsPractice(value, null));
      const target = new URL(url, window.location.origin);
      if (!mentionsPractice(url, text) && !formMentions && !practicePageWrite(method, target)) return original(input, init);
      const state = loadPractice(viewer.id, viewer.role);
      const result = handlePracticeRequest(state, viewer, { method, url: target, body: text, hasFile });
      if (result.forward && method === "GET") return original(result.forward, { signal: init?.signal });
      if (result.changed) savePractice(viewer.id, result.state);
      const note = (result.body as { practiceNote?: unknown } | null)?.practiceNote;
      if (typeof note === "string") window.dispatchEvent(new CustomEvent(PRACTICE_NOTE_EVENT, { detail: note }));
      return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
        status: result.status,
        headers: { "Content-Type": "application/json", "X-Practice": "1" },
      });
    };
  }
  installed.count += 1;
  notify();
  return () => {
    if (!installed) return;
    installed.count -= 1;
    if (installed.count <= 0) {
      window.fetch = installed.original;
      installed = null;
      notify();
    }
  };
}
