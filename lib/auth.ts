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
  /** Included by /api/users/me. */
  school?: { id: string; name: string; code: string } | null;
  department?: { id: string; name: string; code: string } | null;
}

export type Permission =
  | "view:dashboard"
  | "view:submissions"
  | "create:submission"
  | "edit:submission"
  | "comment:submission" // New: Deans can only comment
  | "review:submission"
  | "approve:submission"
  | "reject:submission"
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
  | "manage:cycles"
  | "admin:all";

// Role-based permission mapping
const rolePermissions: Record<UserRole, Permission[]> = {
  HOD: [
    "view:dashboard",
    "view:submissions",
    "edit:submission",
    "comment:submission",
    "review:submission",
    "view:staff",
    "manage:staff",
  ],
  DEAN: [
    // Dean can view, edit, and comment on submissions within their school
    "view:dashboard",
    "view:submissions",
    "edit:submission",
    "comment:submission",
    "view:staff",
  ],
  ADMIN: [
    // Admin can view, comment, review, reject, and approve - NOT create/edit/delete submissions
    "view:dashboard",
    "view:submissions",
    "comment:submission",
    "review:submission",
    "reject:submission",
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
    "manage:cycles",
  ],
  SUPER_ADMIN: [
    // Super Admin has all permissions
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
    "manage:cycles",
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
  if (!user || !user.isActive) return false;
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
    HOD: "Head of Department",
    DEAN: "Dean",
    ADMIN: "Academic Planning Admin",
    SUPER_ADMIN: "Super Administrator",
  };
  return names[role];
}
