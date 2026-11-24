"use client";

/**
 * Task T5: DAP stays in charge of the reminder agent. A dry run for any date
 * (who would hear from it, why, who is copied, and the message), up to 20
 * messages written by the AI for DAP to read, the day's prepared messages to
 * edit or hold, pauses for one desk or everyone, the switch for sending, and
 * every message ever sent.
 */
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pause, Play, Sparkles } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, TableSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates/format";

type Written = { subject: string; body: string; writtenBy: string };
type Planned = {
  deskKey: string;
  recipient: string;
  email: string;
  department: string;
  status: { status: string; label: string; reason: string };
  write: boolean;
  reasons: string[];
  mentions: string[];
  quietBecause: string | null;
  cc: string[];
  paused: boolean;
  preview: Written;
};
type Message = Written & {
  id: string;
  deskKey?: string;
  recipient: string;
  status: string;
  reasons: string[];
  forDate?: string;
  preparedAt?: string;
  sentAt: string | null;
  error?: string | null;
};
type AgentView = {
  date: string;
  settings: { prepareAt: string; sendAt: string };
  controls: { sending: boolean; pausedAll: boolean; pausedDesks: string[] };
  plan: Planned[];
  prepared: Message[];
  history: Message[];
};

const STATUS_TONE: Record<string, string> = {
  ON_TRACK: "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  KEEP_AN_EYE: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  AT_RISK: "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200",
  OVERDUE: "border-red-800 bg-red-900 text-white",
};

function MessageText({ message }: { message: Written }) {
  return (
    <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
      <p className="font-medium">{message.subject}</p>
      <p className="whitespace-pre-line text-muted-foreground">{message.body}</p>
      <p className="text-xs text-muted-foreground">Written by {message.writtenBy === "AI" ? "the AI" : "the plain template"}</p>
    </div>
  );
}

export default function AgentPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const isSuper = currentUser?.role === "SUPER_ADMIN";
  const [date, setDate] = useState("");
  const [view, setView] = useState<AgentView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [samples, setSamples] = useState<(Written & { recipient: string; reasons: string[] })[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const dateId = useId();

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  useEffect(() => {
    if (userLoading || !allowed) return;
    let cancelled = false;
    fetch(`/api/agent${date ? `?date=${date}` : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setView(data);
          setFailed(null);
        } else {
          setFailed(data.error ?? "Couldn't load the reminder agent.");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("Couldn't load the reminder agent.");
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, allowed, date, reloadKey]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(String(body.action) + (body.deskKey ?? body.messageId ?? ""));
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't do that", { description: data.error ?? "Please try again." });
        return null;
      }
      toast.success(done);
      setReloadKey((key) => key + 1);
      return data;
    } finally {
      setBusy(null);
    }
  };

  if (!userLoading && !allowed) return null;
  if (failed) return <ErrorState title={failed} onRetry={() => setReloadKey((key) => key + 1)} />;
  if (!view) return <TableSkeleton columns={4} rows={6} />;

  const writing = view.plan.filter((item) => item.write);
  const quiet = view.plan.filter((item) => !item.write);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reminder agent"
        description={`Each working day the agent prepares its messages to Heads of Department at ${view.settings.prepareAt} and sends them at ${view.settings.sendAt} (West Africa Time), by fixed rules. Read, edit or hold them here, pause a desk or everyone, and read every message ever sent.`}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={view.controls.sending}
              disabled={!isSuper || busy !== null}
              onCheckedChange={(on) => void act({ action: "sending", value: on ? "on" : "off" }, on ? "Sending switched on." : "Sending switched off.")}
            />
            <span>
              <span className="font-medium">Sending is {view.controls.sending ? "on" : "off"}</span>
              <br />
              <span className="text-xs text-muted-foreground">
                {view.controls.sending ? "Prepared messages go out at 8:00 am." : "Messages are prepared and kept here; none are sent."}
                {!isSuper && " Only a Super Administrator changes this."}
              </span>
            </span>
          </label>
          <Button
            variant={view.controls.pausedAll ? "default" : "outline"}
            size="sm"
            disabled={busy !== null}
            onClick={() => void act({ action: view.controls.pausedAll ? "resume" : "pause" }, view.controls.pausedAll ? "Resumed for everyone." : "Paused for everyone.")}
          >
            {view.controls.pausedAll ? <Play /> : <Pause />}
            {view.controls.pausedAll ? "Resume for everyone" : "Pause for everyone"}
          </Button>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={dateId}>Dry run for</Label>
              <Input id={dateId} type="date" value={date || view.date} onChange={(event) => setDate(event.target.value)} className="w-44" />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null || view.plan.length === 0}
              onClick={async () => {
                setBusy("samples");
                try {
                  const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "samples", date: date || view.date }) });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok) setSamples(data.samples);
                  else toast.error("Couldn't write samples", { description: data.error });
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "samples" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Write samples with the AI
            </Button>
          </div>
        </CardContent>
      </Card>

      {samples && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{samples.length} sample messages</CardTitle>
            <CardDescription>Written now with each desk&apos;s own figures; nothing was sent or kept. Check they read as specific and kind.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {samples.map((sample, index) => (
              <div key={index} className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  To {sample.recipient} · {sample.reasons.join(", ")}
                </p>
                <MessageText message={sample} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Dry run: {writing.length} of {view.plan.length} Heads would hear from the agent
          </CardTitle>
          <CardDescription>Why each one would, who is copied, and the plain version of the message.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {view.plan.length === 0 && <p className="text-sm text-muted-foreground">No Heads of Department are drafting in the active cycle.</p>}
          {[...writing, ...quiet].map((item) => (
            <div key={item.deskKey} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.recipient}</span>
                <span className="text-muted-foreground">{item.department}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[item.status.status] ?? ""}`} title={item.status.reason}>
                  {item.status.label}
                </span>
                {item.paused && <Badge variant="outline">Paused</Badge>}
                <span className="ml-auto flex gap-1">
                  {item.write && (
                    <Button variant="ghost" size="sm" onClick={() => setOpen(open === item.deskKey ? null : item.deskKey)}>
                      {open === item.deskKey ? "Hide message" : "Show message"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(
                        { action: view.controls.pausedDesks.includes(item.deskKey) ? "resume" : "pause", deskKey: item.deskKey },
                        view.controls.pausedDesks.includes(item.deskKey) ? "Resumed for this desk." : "Paused for this desk.",
                      )
                    }
                  >
                    {view.controls.pausedDesks.includes(item.deskKey) ? "Resume" : "Pause"}
                  </Button>
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {item.write
                  ? `Writes because: ${[...item.reasons, ...item.mentions].join("; ")}.${item.cc.length ? ` Copied to ${item.cc.join(", ")}.` : ""}`
                  : `Stays quiet: ${item.quietBecause}`}
              </p>
              {open === item.deskKey && <div className="mt-2"><MessageText message={item.preview} /></div>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Prepared for {date || view.date}</CardTitle>
            <CardDescription>Edit or hold a message before it goes out. Held messages are never sent.</CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void act({ action: "prepare", date: date || view.date }, "Messages prepared.")}>
            Prepare now
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {view.prepared.length === 0 && <p className="text-sm text-muted-foreground">Nothing prepared for this date yet.</p>}
          {view.prepared.map((message) => (
            <div key={message.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{message.recipient}</span>
                <Badge variant={message.status === "SENT" ? "secondary" : message.status === "HELD" ? "outline" : message.status === "FAILED" ? "destructive" : "default"}>
                  {message.status.charAt(0) + message.status.slice(1).toLowerCase()}
                </Badge>
                {message.status !== "SENT" && (
                  <span className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(message); setDraft({ subject: message.subject, body: message.body }); }}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void act({ action: message.status === "HELD" ? "release" : "hold", messageId: message.id }, message.status === "HELD" ? "Released." : "Held.")}
                    >
                      {message.status === "HELD" ? "Release" : "Hold"}
                    </Button>
                  </span>
                )}
              </div>
              <MessageText message={message} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Every message sent</CardTitle>
          <CardDescription>The last 100; each is also in the activity log with the facts it used.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {view.history.length === 0 && <p className="text-sm text-muted-foreground">No messages sent yet.</p>}
          {view.history.map((message) => (
            <details key={message.id} className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer">
                {message.forDate} · {message.recipient} · {message.subject}
                {message.status === "FAILED" ? ` · not sent (${message.error})` : message.sentAt ? ` · sent ${formatDateTime(message.sentAt)}` : ""}
              </summary>
              <div className="mt-2"><MessageText message={message} /></div>
            </details>
          ))}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          {editing && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void act({ action: "edit", messageId: editing.id, ...draft }, "Message updated.").then((ok) => ok && setEditing(null));
              }}
            >
              <DialogHeader>
                <DialogTitle>Edit the message to {editing.recipient}</DialogTitle>
                <DialogDescription>Keep to the facts in it; the edit is logged.</DialogDescription>
              </DialogHeader>
              <Input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} aria-label="Subject" />
              <Textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} rows={14} aria-label="Message" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={busy !== null}>Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
