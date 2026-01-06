"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/user-context";
import {
  LayoutDashboard,
  FileText,
  GraduationCap,
  Building2,
  Users,
  School,
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
    href: "/",
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
    title: "Programmes",
    href: "/programmes",
    icon: <GraduationCap className="h-5 w-5" />,
    permission: "view:programmes",
  },
  {
    title: "Departments",
    href: "/departments",
    icon: <Building2 className="h-5 w-5" />,
    permission: "view:departments",
  },
  {
    title: "Schools",
    href: "/schools",
    icon: <School className="h-5 w-5" />,
    permission: "view:schools",
  },
  {
    title: "Users",
    href: "/users",
    icon: <Users className="h-5 w-5" />,
    permission: "view:users",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission } = usePermission();

  // Filter nav items based on user permissions
  const visibleNavItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
      {/* Logo/Brand */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2">
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
      <nav className="space-y-1 p-4">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* Footer - Phase indicator */}
      <div className="absolute bottom-0 left-0 right-0 border-t p-4">
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">Review Cycle</p>
          <p>2027-2031</p>
        </div>
      </div>
    </aside>
  );
}
