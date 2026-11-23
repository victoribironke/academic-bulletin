"use client";

/**
 * The help panel (work order task H1): a quick start for the person's role in
 * the exact words of the screens, their current deadline and next
 * checkpoint, the DAP officer for their school, and the Academic Policy (H9).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpenText, CalendarClock, HelpCircle, Mail, MessageCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUser } from "@/contexts/user-context";
import { PolicyInline } from "@/components/policy/policy-text";
import { parseInline } from "@/lib/policy/markdown";
import { SIGN_IN_STEP, quickStartFor } from "@/lib/help/quick-start";

type Officer = { name: string; email: string; whatsapp: string | null };
type HelpDetails = { officer: Officer | null; generalHelp: string | null; cycle: string | null; submitOpens: string | null };
type Desk = { label: string; headline: string; dueLine: string; nextLine: string | null } | null;

function Step({ text }: { text: string }) {
  return <PolicyInline content={parseInline(text)} />;
}

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const { currentUser } = useUser();
  const [details, setDetails] = useState<HelpDetails | null>(null);
  const [desk, setDesk] = useState<Desk>(null);
  const role = currentUser?.role ?? "HOD";
  const isAcademicPlanning = role === "ADMIN" || role === "SUPER_ADMIN";
  const guide = quickStartFor(role, details?.submitOpens ?? null);

  // Loaded the first time the panel opens.
  useEffect(() => {
    if (!open || details) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/help").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/calendar/desk").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([help, calendar]) => {
        if (cancelled) return;
        setDetails(help ?? { officer: null, generalHelp: null, cycle: null, submitOpens: null });
        setDesk(calendar?.desk ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetails({ officer: null, generalHelp: null, cycle: null, submitOpens: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, details]);

  const whatsappLink = (number: string) => `https://wa.me/${number.replace(/[^\d]/g, "")}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50"
          aria-label="Help and quick start"
        >
          <HelpCircle className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription>
            {details?.cycle ? `${details.cycle}. ` : ""}What to do, in the words you&apos;ll see on the screens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-sm">
          {desk && (
            <section aria-label="Your deadline" className="flex gap-3 rounded-lg border bg-muted/40 p-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">
                  Your deadline: {desk.label} ({desk.headline.toLowerCase()})
                </p>
                <p className="text-muted-foreground">{desk.dueLine}</p>
                {desk.nextLine && <p className="text-muted-foreground">{desk.nextLine}</p>}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-semibold text-base">Step by step</h3>
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              {guide.steps.map((step) => (
                <li key={step}>
                  <Step text={step} />
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold text-base">Signing in</h3>
            <p className="text-muted-foreground">
              <Step text={SIGN_IN_STEP} />
            </p>
          </section>

          {!isAcademicPlanning && (
            <section className="space-y-2">
              <h3 className="font-semibold text-base">Your DAP officer</h3>
              {details?.officer ? (
                <div className="space-y-1.5 rounded-lg border p-3">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
                    {details.officer.name}
                  </p>
                  <a className="flex items-center gap-2 text-primary underline-offset-2 hover:underline" href={`mailto:${details.officer.email}`}>
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {details.officer.email}
                  </a>
                  {details.officer.whatsapp && (
                    <a
                      className="flex items-center gap-2 text-primary underline-offset-2 hover:underline"
                      href={whatsappLink(details.officer.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      WhatsApp {details.officer.whatsapp}
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {details?.generalHelp ?? "Contact the Directorate of Academic Planning."}
                </p>
              )}
            </section>
          )}

          {/* H9: the Academic Policy from every screen. */}
          <Link
            href="/policy"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 hover:bg-muted"
          >
            <BookOpenText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="block font-medium text-foreground">Academic Policy</span>
              <span className="block text-muted-foreground">Contents and search, for example &quot;Academic Load&quot;.</span>
            </span>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
