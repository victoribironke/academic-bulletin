import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandedShellProps = {
  children: React.ReactNode;
  className?: string;
  /** When set, the brand block is a link (e.g. `/login`). */
  brandHref?: string;
};

function Brand() {
  return (
    <span className="flex items-center justify-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <GraduationCap className="size-5" />
      </span>
      <span className="text-left">
        <span className="block text-base font-semibold leading-snug text-foreground">
          Academic Bulletin
        </span>
        <span className="block text-sm leading-snug text-muted-foreground">
          Babcock University
        </span>
      </span>
    </span>
  );
}

/** Centered card used by the sign-in page, with the university branding on top. */
export function BrandedShell({
  children,
  className,
  brandHref,
}: BrandedShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4 sm:p-6">
      <div
        className={cn(
          "w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-sm",
          className,
        )}
      >
        <div className="border-b px-6 py-6 sm:px-8">
          {brandHref ? (
            <Link
              href={brandHref}
              className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Brand />
            </Link>
          ) : (
            <Brand />
          )}
        </div>
        <div className="px-6 py-8 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
