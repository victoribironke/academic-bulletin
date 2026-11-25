"use client";

/**
 * Task K4: the search box in the top bar, and Ctrl or Cmd + K on every page.
 * Results come from /api/search grouped by type (courses, programmes, units,
 * people, policy sections), with the matched words highlighted; actions
 * ("Open my desk", "Academic Load policy") are searchable too. Arrow keys
 * move through results, Enter opens one, and recent searches are kept on
 * this device only.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Search } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/user-context";
import { SEARCH_SETTINGS } from "@/lib/search/config";
import { foldText } from "@/lib/search/normalise";

type Result = { type: string; id: string; title: string; code: string | null; secondary: string | null; url: string };
type Group = { type: string; label: string; results: Result[] };
type Action = { title: string; href: string; words?: string; roles?: string[] };

const ADMIN = ["ADMIN", "SUPER_ADMIN"];
/** Things to do, found by name (section 9.1). Pages still check who may open them. */
const ACTIONS: Action[] = [
  { title: "Open my desk", href: "/dashboard", words: "home dashboard deadlines waiting" },
  { title: "My submissions", href: "/submissions", words: "drafts bulletins programmes" },
  { title: "Open the Academic Policy", href: "/policy", words: "rules regulations" },
  { title: "Academic Load policy", href: "/policy#academic-load", words: "units credits semester load" },
  { title: "Open the Course Registry", href: "/master-courses", words: "courses master registry" },
  { title: "Programme coordinators", href: "/coordinators", words: "coordinator name invite drafter delegate", roles: ["HOD"] },
  { title: "Courses we own", href: "/courses-we-own", words: "owned shared descriptions learning outcomes", roles: ["HOD", "PROGRAMME_COORDINATOR", "DEAN"] },
  { title: "Course owners", href: "/courses-we-own", words: "owned shared general education desk unowned", roles: ADMIN },
  { title: "Open the staff directory", href: "/staff", words: "people lecturers" },
  { title: "Open academic units", href: "/academic-units", words: "schools departments programmes" },
  { title: "Review cycles and calendars", href: "/review-cycles", words: "calendar dates deadlines extension holiday", roles: ADMIN },
  { title: "Answer questions for DAP", href: "/dap-questions", words: "ask dap inbox", roles: ADMIN },
  { title: "Course change requests", href: "/course-requests", words: "course list confirm", roles: ADMIN },
  { title: "Registry completeness report", href: "/reports/registry", words: "report missing", roles: ADMIN },
  { title: "Users and invitations", href: "/users", words: "people accounts roster", roles: ADMIN },
  { title: "Activity log", href: "/activity-log", words: "history audit", roles: ADMIN },
  { title: "Archive", href: "/archive", words: "deleted restore", roles: ADMIN },
];

const RECENT_KEY = "abrs-recent-searches";
function readRecent(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((item) => typeof item === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function keepRecent(query: string) {
  try {
    const next = [query, ...readRecent().filter((item) => item !== query)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: nothing remembered.
  }
}

/** The title with the typed words marked. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const words = query.split(/\s+/).filter((word) => word.length > 1).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchCommand() {
  const router = useRouter();
  const { currentUser } = useUser();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [searched, setSearched] = useState("");
  const [switchedOff, setSwitchedOff] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search after typing stops (150 ms, from the settings file).
  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then(async (res) => {
          if (cancelled) return;
          if (res.status === 503) setSwitchedOff(true);
          if (!res.ok) return;
          const data = (await res.json()) as { groups: Group[] };
          setGroups(data.groups);
          setSearched(term);
        })
        .catch(() => undefined);
    }, SEARCH_SETTINGS.limits.debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const role = currentUser?.role ?? "";
  const actions = useMemo(() => {
    const allowed = ACTIONS.filter((action) => !action.roles || action.roles.includes(role));
    const folded = foldText(query);
    if (!folded) return allowed.slice(0, 5);
    return allowed.filter((action) => folded.split(" ").every((word) => foldText(`${action.title} ${action.words ?? ""}`).includes(word))).slice(0, 5);
  }, [query, role]);

  const go = useCallback(
    (url: string, remember?: string) => {
      if (remember) keepRecent(remember);
      setOpen(false);
      router.push(url);
    },
    [router],
  );

  const term = query.trim();
  const showResults = term.length >= 2 && searched === term;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-muted-foreground sm:w-56 sm:justify-start"
        onClick={() => setOpen(true)}
        aria-label="Search (Ctrl or Cmd + K)"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">⌘K</kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setRecent(readRecent());
          } else {
            setQuery("");
            setGroups([]);
            setSearched("");
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>Courses, programmes, departments, people, policy sections and actions.</DialogDescription>
          </DialogHeader>
          <Command label="Search" shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search courses, programmes, people, policy... (try ECO 101)"
              aria-label="Search"
            />
            <CommandList className="max-h-[60vh]">
              {term.length >= 2 && showResults && groups.length === 0 && actions.length === 0 && (
                <CommandEmpty>No matches for &ldquo;{term}&rdquo;. Try a course code, a title or a name.</CommandEmpty>
              )}
              {switchedOff && <p className="px-3 py-2 text-xs text-muted-foreground">Searching records isn&apos;t switched on yet on this site; actions still work.</p>}
              {term.length < 2 && recent.length > 0 && (
                <CommandGroup heading="Recent searches">
                  {recent.map((item) => (
                    <CommandItem key={item} value={`recent ${item}`} onSelect={() => setQuery(item)}>
                      <Clock aria-hidden="true" />
                      {item}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showResults &&
                groups.map((group) => (
                  <CommandGroup key={group.type} heading={group.label}>
                    {group.results.map((result) => (
                      <CommandItem key={`${group.type}:${result.id}`} value={`${group.type}:${result.id}`} onSelect={() => go(result.url, term)}>
                        <div className="min-w-0">
                          <p className="truncate">
                            {result.code && result.type === "course" && (
                              <span className="mr-1.5 font-mono font-semibold">
                                <Highlighted text={result.code} query={term} />
                              </span>
                            )}
                            <Highlighted text={result.title} query={term} />
                          </p>
                          {result.secondary && <p className="truncate text-xs text-muted-foreground">{result.secondary}</p>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              {actions.length > 0 && (
                <CommandGroup heading="Actions">
                  {actions.map((action) => (
                    <CommandItem key={action.href + action.title} value={`action ${action.title}`} onSelect={() => go(action.href)}>
                      <ArrowRight aria-hidden="true" />
                      <Highlighted text={action.title} query={term} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
