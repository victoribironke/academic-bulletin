"use client";

import { useUser } from "@/contexts/user-context";
import { getRoleDisplayName } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChevronDown, User as UserIcon, Menu } from "lucide-react";
import { SidebarContent } from "./sidebar";

export function Header() {
  const { currentUser, isLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  // const getRoleBadgeVariant = (role: string) => {
  //   switch (role) {
  //     case "ADMIN":
  //       return "destructive";
  //     case "DEAN":
  //       return "default";
  //     case "HOD":
  //       return "secondary";
  //     default:
  //       return "outline";
  //   }
  // };

  return (
    <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b bg-background px-6">
      {/* Left side - Page title area (can be used by pages) */}
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-0"
          >
            <SidebarContent />
          </SheetContent>
        </Sheet>
        {/* Placeholder for breadcrumbs or page title */}
      </div>

      {/* Right side - User selector */}
      <div className="flex items-center gap-4">
        {/* Mock User Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                  <div className="flex flex-col items-start gap-1">
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ) : currentUser ? (
                <>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                      {getInitials(currentUser.firstName, currentUser.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left max-w-[150px]">
                    <span className="text-sm font-medium truncate w-full">
                      {currentUser.firstName} {currentUser.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {getRoleDisplayName(currentUser.role)}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </>
              ) : (
                <>
                  <UserIcon className="h-5 w-5" />
                  <span>Select User</span>
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {currentUser && (
              <>
                <DropdownMenuLabel className="font-normal relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {currentUser.firstName} {currentUser.lastName}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {currentUser.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <button
              onClick={handleLogout}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50 text-destructive hover:text-destructive"
            >
              Log out
            </button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
