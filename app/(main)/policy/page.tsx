"use client";

/**
 * The Academic Policy library (work order task H9): contents, search, the
 * note that the policy is under review, earlier versions, and an upload for
 * Academic Planning. Everyone signed in can read it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpenText, Info, Loader2, Search, Upload, X } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, TableSkeleton } from "@/components/shared/states";
import { PolicyBlocks } from "@/components/policy/policy-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { blocksText, parseBlocks } from "@/lib/policy/markdown";

type VersionSummary = {
  id: string;
  label: string;
  note: string | null;
  sourceName: string | null;
  createdAt: string | null;
  isCurrent: boolean;
  builtIn: boolean;
};
type Section = { id: string; level: 1 | 2 | 3; title: string; body: string };
type PolicyView = { title: string; intro: string; sections: Section[]; version: VersionSummary; versions: VersionSummary[] };

const UNDER_REVIEW =
  "The Academic Policy is under review. Until Senate approves the revised policy, the version shown here applies.";

export default function PolicyPage() {
  const { currentUser } = useUser();
  const canUpload = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const [policy, setPolicy] = useState<PolicyView | null>(null);
  const [failed, setFailed] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/policy${versionId ? `?version=${encodeURIComponent(versionId)}` : ""}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: PolicyView) => {
        if (cancelled) return;
        setPolicy(data);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId, reloadKey]);

  // Each section parsed once, with its words for search.
  const sections = useMemo(
    () =>
      (policy?.sections ?? []).map((section) => {
        const blocks = parseBlocks(section.body);
        return { ...section, blocks, words: `${section.title}\n${blocksText(blocks)}`.toLowerCase() };
      }),
    [policy],
  );
  const intro = useMemo(() => parseBlocks(policy?.intro ?? ""), [policy]);
  const needle = query.trim().toLowerCase();
  const matching = useMemo(
    () => (needle ? sections.filter((section) => section.words.includes(needle)) : sections),
    [needle, sections],
  );

  // Open the section named in the address (/policy#academic-load) once loaded.
  useEffect(() => {
    if (!policy || !window.location.hash) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    target?.scrollIntoView({ block: "start" });
  }, [policy]);

  // "/" jumps to the search box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goTo = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const contents = (
    <nav aria-label="Contents" className="space-y-0.5 text-sm">
      {matching.length === 0 ? (
        <p className="px-2 py-1 text-muted-foreground">No section mentions “{query.trim()}”.</p>
      ) : (
        matching.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => {
              event.preventDefault();
              goTo(section.id);
            }}
            className={`block rounded-md px-2 py-1 hover:bg-muted ${
              section.level === 1 ? "font-medium text-foreground" : section.level === 2 ? "pl-5 text-muted-foreground" : "pl-8 text-muted-foreground"
            }`}
          >
            {section.title}
          </a>
        ))
      )}
    </nav>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Academic Policy"
        description={
          policy
            ? `${policy.version.label}${policy.version.sourceName ? `. ${policy.version.sourceName}` : ""}.`
            : "The university's Academic Policies Manual."
        }
        actions={
          <>
            {policy && policy.versions.length > 1 && (
              <Select value={policy.version.id} onValueChange={(value) => setVersionId(value)}>
                <SelectTrigger className="w-64 bg-card" aria-label="Version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {policy.versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.label}
                      {version.isCurrent ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {canUpload && <UploadVersion onUploaded={() => { setVersionId(null); setReloadKey((key) => key + 1); }} />}
          </>
        }
      />

      {failed ? (
        <ErrorState onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !policy ? (
        <TableSkeleton columns={2} rows={6} />
      ) : (
        <>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {policy.version.isCurrent ? (policy.version.note ?? UNDER_REVIEW) : (
                <>
                  You are reading an earlier version ({policy.version.label}).{" "}
                  <Button variant="link" className="h-auto p-0" onClick={() => setVersionId(null)}>
                    Open the current version
                  </Button>
                </>
              )}
            </AlertDescription>
          </Alert>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Search the policy, for example "academic load" (press / to search)'
              className="bg-card pl-9 pr-9"
              aria-label="Search the Academic Policy"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setQuery("")}
                aria-label="Clear the search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {needle && (
            <p className="text-sm text-muted-foreground" role="status">
              {matching.length === 0
                ? "No section matches."
                : `${matching.length} ${matching.length === 1 ? "section mentions" : "sections mention"} “${query.trim()}”.`}
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
              <details className="rounded-lg border bg-card p-2 lg:hidden" open={Boolean(needle)}>
                <summary className="cursor-pointer px-2 py-1 text-sm font-medium">Contents</summary>
                <div className="pt-2">{contents}</div>
              </details>
              <div className="hidden rounded-lg border bg-card p-2 lg:block">
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contents</p>
                {contents}
              </div>
            </aside>

            <article className="min-w-0 space-y-4 rounded-lg border bg-card p-4 text-sm sm:p-6">
              {!needle && intro.length > 0 && (
                <div className="space-y-1 border-b pb-4 text-center text-muted-foreground">
                  <BookOpenText className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
                  <PolicyBlocks blocks={intro} />
                </div>
              )}
              {matching.map((section) => {
                const Heading = section.level === 1 ? "h2" : section.level === 2 ? "h3" : "h4";
                return (
                  <section key={section.id} aria-labelledby={`${section.id}-title`} className="space-y-3">
                    <Heading
                      id={section.id}
                      className={`scroll-mt-24 font-semibold text-foreground ${
                        section.level === 1 ? "border-b pb-1 pt-4 text-lg" : section.level === 2 ? "pt-2 text-base" : "text-sm"
                      }`}
                    >
                      <span id={`${section.id}-title`}>{section.title}</span>
                    </Heading>
                    <PolicyBlocks blocks={section.blocks} highlight={needle} />
                  </section>
                );
              })}
            </article>
          </div>
        </>
      )}
    </div>
  );
}

function UploadVersion({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!file) {
      setError("Choose the policy file (markdown, .md).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = await file.text();
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, note: note || null, sourceName: file.name, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't upload the policy. Please try again.");
        return;
      }
      toast.success(`"${label}" is now the current Academic Policy.`);
      setOpen(false);
      setLabel("");
      setNote("");
      setFile(null);
      onUploaded();
    } catch {
      setError("Couldn't upload the policy. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload />
        Upload a new version
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a new version of the Academic Policy</DialogTitle>
          <DialogDescription>
            Use a markdown (.md) file with &quot;#&quot; and &quot;##&quot; headings, as in the current version. It becomes
            the current version at once; earlier versions stay readable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="policy-label">Version name</Label>
            <Input
              id="policy-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Updated January 15, 2027"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="policy-note">Note shown above the policy (optional)</Label>
            <Textarea id="policy-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="policy-file">Policy file</Label>
            <Input
              id="policy-file"
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={upload} disabled={busy || label.trim().length < 3 || !file}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            Upload and make current
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
