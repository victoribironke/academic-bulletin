"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarClock,
  ChevronsUpDown,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Network,
  UserCog,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission, useUser } from "@/contexts/user-context";
import { getRoleDisplayName, type Permission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@prisma/client";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  roles?: UserRole[];
  /** Extra path prefixes that should mark this item as active. */
  matches?: string[];
};

type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: "view:dashboard",
      },
      {
        title: "Submissions",
        href: "/submissions",
        icon: FileText,
        permission: "view:submissions",
        matches: ["/submissions"],
      },
      {
        title: "Bulletins",
        href: "/bulletins",
        icon: LibraryBig,
        roles: ["DEAN", "ADMIN", "SUPER_ADMIN"],
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        title: "Academic Units",
        href: "/academic-units",
        icon: Network,
        permission: "view:schools",
      },
      {
        title: "Master Courses",
        href: "/master-courses",
        icon: BookOpen,
        permission: "view:schools",
      },
      {
        title: "Staff",
        href: "/staff",
        icon: UserCog,
        permission: "view:staff",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "Review Cycles",
        href: "/review-cycles",
        icon: CalendarClock,
        permission: "manage:cycles",
      },
      {
        title: "Users",
        href: "/users",
        icon: Users,
        permission: "view:users",
      },
    ],
  },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.matches ?? [item.href];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function initials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function useActiveCycleName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cycles")
      .then((res) => (res.ok ? res.json() : []))
      .then((cycles: Array<{ name: string; isActive: boolean }>) => {
        if (!cancelled) {
          setName(cycles.find((c) => c.isActive)?.name ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return name;
}

function NavUser() {
  const { currentUser, isLoading } = useUser();
  const { isMobile } = useSidebar();

  const handleLogout = async () => {
    await createClient().auth.signOut();
    window.location.assign("/login");
  };

  if (isLoading || !currentUser) {
    return (
      <div className="flex items-center gap-2 p-2">
        <Skeleton className="size-8 rounded-lg" />
        <div className="flex-1 space-y-1.5 group-data-[collapsible=icon]:hidden">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    );
  }

  const fullName = `${currentUser.firstName} ${currentUser.lastName}`;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {initials(currentUser.firstName, currentUser.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{fullName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {getRoleDisplayName(currentUser.role)}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="truncate font-medium">{fullName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentUser.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { hasPermission } = usePermission();
  const { currentUser } = useUser();
  const { setOpenMobile } = useSidebar();
  const cycleName = useActiveCycleName();

  const canSee = (item: NavItem) => {
    if (!currentUser) return false;
    if (item.roles && !item.roles.includes(currentUser.role)) return false;
    return !item.permission || hasPermission(item.permission);
  };

  // HODs work on their own department's submission.
  const hrefFor = (item: NavItem) =>
    item.href === "/submissions" && currentUser?.role === "HOD"
      ? "/submissions/me"
      : item.href;

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Academic Bulletin">
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GraduationCap className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    Academic Bulletin
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Babcock University
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(canSee);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isItemActive(item, pathname)}
                    >
                      <Link
                        href={hrefFor(item)}
                        onClick={() => setOpenMobile(false)}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {cycleName && (
          <div className="mx-2 rounded-md border bg-background px-3 py-2 text-xs group-data-[collapsible=icon]:hidden">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="size-1.5 rounded-full bg-brand-gold" aria-hidden="true" />
              Active review cycle
            </p>
            <p className="truncate text-muted-foreground">{cycleName}</p>
          </div>
        )}
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
