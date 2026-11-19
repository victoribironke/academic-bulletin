"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The text saved or copied: one code per line, with a short heading. */
function codesText(codes: string[], account: string): string {
  return [
    `Academic Bulletin recovery codes for ${account}`,
    "Each code signs you in once if you can't use your authenticator app.",
    "",
    ...codes,
    "",
  ].join("\n");
}

/** Ten recovery codes, shown once, with buttons to copy or download them. */
export function RecoveryCodes({ codes, account }: { codes: string[]; account: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codesText(codes, account));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([codesText(codes, account)], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "academic-bulletin-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border bg-muted/50 p-4 font-mono text-sm tracking-wide text-foreground"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download />
          Download
        </Button>
      </div>
    </div>
  );
}
