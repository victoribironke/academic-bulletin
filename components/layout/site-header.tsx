"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useUser } from "@/contexts/user-context";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  submissions: "Submissions",
  me: "My Submission",
  browse: "Browse",
  new: "New Submission",
  bulletins: "Bulletins",
  "academic-units": "Academic Units",
  "master-courses": "Master Courses",
  staff: "Staff",
  "review-cycles": "Review Cycles",
  users: "Users",
};

type Crumb = { label: string; href: string };

function buildCrumbs(pathname: string, isHod: boolean): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = "";

  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const known = SEGMENT_LABELS[segment];
    // An unknown segment after /submissions is a submission id.
    const label =
      known ?? (segments[index - 1] === "submissions" ? "Submission" : segment);
    // HODs don't use the all-submissions list; point them at their own.
    const target =
      href === "/submissions" && isHod ? "/submissions/me" : href;
    crumbs.push({ label, href: target });
  });

  // "/submissions/me" for an HOD would read "Submissions › My Submission",
  // which is the same page twice. Keep just the last one.
  if (isHod && crumbs[0]?.href === "/submissions/me" && crumbs.length > 1) {
    crumbs.shift();
  }

  return crumbs;
}

export function SiteHeader() {
  const pathname = usePathname();
  const { currentUser } = useUser();
  const crumbs = buildCrumbs(pathname, currentUser?.role === "HOD");

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:rounded-t-xl">
      <div className="flex w-full items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <Fragment key={crumb.href + index}>
                  {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                  <BreadcrumbItem className={isLast ? "" : "hidden md:block"}>
                    {isLast ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
