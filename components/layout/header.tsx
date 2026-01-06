"use client";

import { useUser } from "@/contexts/user-context";
import { getRoleDisplayName } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, User as UserIcon } from "lucide-react";

export function Header() {
  const { currentUser, availableUsers, setCurrentUser, isLoading } = useUser();

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "destructive";
      case "DEAN":
        return "default";
      case "HOD":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
      {/* Left side - Page title area (can be used by pages) */}
      <div className="flex items-center gap-4">
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
              {currentUser ? (
                <>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {getInitials(currentUser.firstName, currentUser.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium">
                      {currentUser.firstName} {currentUser.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
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
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-2">
              <span>Switch User</span>
              <Badge variant="outline" className="text-xs">
                Mock Auth
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableUsers.map((user) => (
              <DropdownMenuItem
                key={user.id}
                onClick={() => setCurrentUser(user)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
                <Badge
                  variant={getRoleBadgeVariant(user.role)}
                  className="text-xs"
                >
                  {user.role}
                </Badge>
              </DropdownMenuItem>
            ))}
            {availableUsers.length === 0 && !isLoading && (
              <div className="p-2 text-center text-sm text-muted-foreground">
                No users found. Run seed script.
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
