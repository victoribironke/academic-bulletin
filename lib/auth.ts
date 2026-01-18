// Types for the user context
import { UserRole } from "@prisma/client";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  schoolId: string | null;
  departmentId: string | null;
}

export type Permission =
  | "view:dashboard"
  | "view:submissions"
  | "create:submission"
  | "edit:submission"
  | "comment:submission" // New: Deans can only comment
  | "review:submission"
  | "approve:submission"
  | "view:schools"
  | "manage:schools"
  | "view:departments"
  | "manage:departments"
  | "view:programmes"
  | "manage:programmes"
  | "view:users"
  | "manage:users"
  | "view:staff"
  | "manage:staff"
  | "admin:all";

// Role-based permission mapping
const rolePermissions: Record<UserRole, Permission[]> = {
  COORDINATOR: [
    "view:dashboard",
    "view:submissions",
    "create:submission",
    "edit:submission",
    "view:programmes",
    "view:departments",
    "view:schools",
    "view:staff",
  ],
  HOD: [
    "view:dashboard",
    "view:submissions",
    "create:submission",
    "edit:submission",
    "comment:submission",
    "review:submission",
    "view:programmes",
    "manage:programmes",
    "view:departments",
    "view:schools",
    "view:staff",
    "manage:staff",
  ],
  DEAN: [
    // Dean can ONLY view and comment - cannot edit submissions
    "view:dashboard",
    "view:submissions",
    "comment:submission", // Can add comments/feedback
    "view:programmes",
    "view:departments",
    "view:schools",
    "view:staff",
  ],
  ADMIN: [
    "view:dashboard",
    "view:submissions",
    "create:submission",
    "edit:submission",
    "comment:submission",
    "review:submission",
    "approve:submission",
    "view:schools",
    "manage:schools",
    "view:departments",
    "manage:departments",
    "view:programmes",
    "manage:programmes",
    "view:users",
    "manage:users",
    "view:staff",
    "manage:staff",
    "admin:all",
  ],
};

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  user: User | null,
  permission: Permission,
): boolean {
  if (!user) return false;
  const permissions = rolePermissions[user.role];
  return permissions.includes(permission) || permissions.includes("admin:all");
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(
  user: User | null,
  permissions: Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

/**
 * Get display name for a role
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    COORDINATOR: "Programme Coordinator",
    HOD: "Head of Department",
    DEAN: "Dean",
    ADMIN: "Academic Planning Admin",
  };
  return names[role];
}
