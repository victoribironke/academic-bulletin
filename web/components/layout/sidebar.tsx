"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermission, useUser } from "@/contexts/user-context";
import {
  LayoutDashboard,
  FileText,
  Users,
  Network,
  BookOpen,
  UserCog,
  CalendarClock,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  permission?: Parameters<typeof import("@/lib/auth").hasPermission>[1];
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5 shrink-0" />,
    permission: "view:dashboard",
  },
  {
    title: "Submissions",
    href: "/submissions",
    icon: <FileText className="h-5 w-5 shrink-0" />,
    permission: "view:submissions",
  },
  {
    title: "Academic Units",
    href: "/academic-units",
    icon: <Network className="h-5 w-5 shrink-0" />,
    permission: "view:schools",
  },
  {
    title: "Master Courses",
    href: "/master-courses",
    icon: <BookOpen className="h-5 w-5 shrink-0" />,
    permission: "view:schools",
  },
  {
    title: "Staff",
    href: "/staff",
    icon: <UserCog className="h-5 w-5 shrink-0" />,
    permission: "view:staff",
  },
  {
    title: "Review Cycles",
    href: "/review-cycles",
    icon: <CalendarClock className="h-5 w-5 shrink-0" />,
    permission: "manage:cycles",
  },
  {
    title: "Users",
    href: "/users",
    icon: <Users className="h-5 w-5 shrink-0" />,
    permission: "view:users",
  },
];

export function SidebarContent() {
  const pathname = usePathname();
  const { hasPermission } = usePermission();
  const { currentUser } = useUser();

  const submissionsHref =
    currentUser?.role === "HOD" ? "/submissions/me" : "/submissions";

  const visibleNavItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <>
      <div className="shrink-0 border-b border-sidebar-border px-4 py-4">
        <Link
          href="/dashboard"
          className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="block pl-3 text-sm font-semibold leading-snug text-foreground">
            Academic Bulletin
          </span>
          <span className="mt-1 block pl-3 text-xs text-muted-foreground">
            Babcock University
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto p-3">
        {visibleNavItems.map((item) => {
          const href =
            item.href === "/submissions" ? submissionsHref : item.href;
          const isSubmissions = item.href === "/submissions";
          const isActive = isSubmissions
            ? pathname === href ||
              pathname.startsWith("/submissions/") ||
              pathname === "/submissions/browse"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.title}
              href={href}
              className={cn(
                "flex items-center gap-3 border-l-2 py-2.5 pl-3 pr-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary bg-muted/80 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {item.icon}
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">Review cycle</p>
          <p>2027–2031</p>
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <SidebarContent />
    </aside>
  );
}
