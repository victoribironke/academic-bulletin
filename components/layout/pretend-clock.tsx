"use client";

/**
 * The test site's pretend clock (work order section 13), in the TEST SITE
 * banner. Pick a date and time in West Africa Time and the countdowns,
 * checkpoints, "My desk" and the "Submit to School" date behave as on that
 * date, in this browser only. The layout shows it only on the test site, and
 * the live site ignores the setting.
 */
import { useState, useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/dates/format";
import { PRETEND_NOW_COOKIE, parsePretendNow, pretendNowFromWat } from "@/lib/pretend-clock";

const readCookie = () => {
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${PRETEND_NOW_COOKIE}=`));
  return entry ? entry.slice(PRETEND_NOW_COOKIE.length + 1) : "";
};
// The cookie only changes here, and the page reloads when it does.
const subscribe = () => () => {};

export function PretendClock() {
  const raw = useSyncExternalStore(subscribe, readCookie, () => "");
  const pretend = parsePretendNow(raw);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("2026-11-26T08:00");
  const [error, setError] = useState("");

  const save = (iso: string | null) => {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = iso
      ? `${PRETEND_NOW_COOKIE}=${encodeURIComponent(iso)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${secure}`
      : `${PRETEND_NOW_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    window.location.reload();
  };

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const iso = pretendNowFromWat(value);
    if (!iso) {
      setError("Choose a date and time between 2026 and 2031.");
      return;
    }
    save(iso);
  };

  if (editing) {
    return (
      <form onSubmit={apply} className="inline-flex flex-wrap items-center justify-center gap-2 font-normal">
        <label htmlFor="pretend-now">Pretend it is (West Africa Time)</label>
        <input
          id="pretend-now"
          type="datetime-local"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          className="rounded border border-amber-700 bg-amber-50 px-1 text-amber-950"
          aria-describedby={error ? "pretend-now-error" : undefined}
        />
        <button type="submit" className="rounded bg-amber-950 px-2 text-amber-50">
          Set
        </button>
        <button type="button" className="underline" onClick={() => setEditing(false)}>
          Cancel
        </button>
        {error && (
          <span id="pretend-now-error" role="alert">
            {error}
          </span>
        )}
      </form>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 font-normal">
      {pretend ? (
        <>
          <span>
            Pretend clock: <strong>{formatDateTime(pretend)}</strong>
          </span>
          <button type="button" className="underline" onClick={() => setEditing(true)}>
            Change
          </button>
          <button type="button" className="underline" onClick={() => save(null)}>
            Use the real time
          </button>
        </>
      ) : (
        <button type="button" className="underline" onClick={() => setEditing(true)}>
          Pretend it is another date
        </button>
      )}
    </span>
  );
}
