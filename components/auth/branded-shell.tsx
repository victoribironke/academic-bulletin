import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandedShellProps = {
  children: React.ReactNode;
  className?: string;
  /** When set, the brand block is a link (e.g. `/login`). */
  brandHref?: string;
};

export function BrandedShell({
  children,
  className,
  brandHref,
}: BrandedShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div
        className={cn(
          "w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-sm",
          className,
        )}
      >
        <div className="bg-primary px-6 py-5 text-center sm:px-8 sm:py-6">
          {brandHref ? (
            <Link
              href={brandHref}
              className="block rounded-sm text-center outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span className="block text-base font-semibold leading-snug tracking-tight text-brand-gold">
                Babcock University
              </span>
              <span className="mt-0.5 block text-sm font-semibold leading-snug text-brand-gold/95">
                Academic Bulletin
              </span>
            </Link>
          ) : (
            <div className="text-center">
              <span className="block text-base font-semibold leading-snug tracking-tight text-brand-gold">
                Babcock University
              </span>
              <span className="mt-0.5 block text-sm font-semibold leading-snug text-brand-gold/95">
                Academic Bulletin
              </span>
            </div>
          )}
        </div>
        <div className="relative px-8 py-8">{children}</div>
      </div>
    </div>
  );
}
