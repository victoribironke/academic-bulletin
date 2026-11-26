"use client";

/**
 * Task U1: the last-resort page when even the layout breaks. It has no
 * site styles to lean on, so it keeps to plain HTML in the site's colours.
 */
import { useEffect } from "react";
import { OUR_SIDE } from "@/lib/messages";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Site error", error.digest ?? "", error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#0f172a", margin: 0 }}>
        <main role="alert" style={{ maxWidth: 520, margin: "15vh auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#003cbb" }}>The Academic Bulletin Review System couldn&apos;t open</h1>
          <p style={{ color: "#475569", lineHeight: 1.5 }}>
            {OUR_SIDE} If it keeps happening, tell Academic Planning through Ask DAP.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
