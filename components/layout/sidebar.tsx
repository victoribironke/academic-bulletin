"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/user-context";
import {
  LayoutDashboard,
  FileText,
  Users,
  Network,
  GraduationCap,
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
    icon: <LayoutDashboard className="h-5 w-5" />,
    permission: "view:dashboard",
  },
  {
    title: "Submissions",
    href: "/submissions",
    icon: <FileText className="h-5 w-5" />,
    permission: "view:submissions",
  },
  {
    title: "Academic Units",
    href: "/academic-units",
    icon: <Network className="h-5 w-5" />,
    permission: "view:schools",
  },
  {
    title: "Users",
    href: "/users",
    icon: <Users className="h-5 w-5" />,
    permission: "view:users",
  },
];

export function SidebarContent() {
  const pathname = usePathname();
  const { hasPermission } = usePermission();

  // Filter nav items based on user permissions
  const visibleNavItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <>
      {/* Logo/Brand */}
      <div className="flex h-16 shrink-0 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-none">Academic</span>
            <span className="text-xs text-muted-foreground">
              Bulletin System
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.icon}
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* Footer - Phase indicator */}
      <div className="shrink-0 border-t p-4">
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">Review Cycle</p>
          <p>2027-2031</p>
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r bg-card md:flex">
      <SidebarContent />
    </aside>
  );
}
