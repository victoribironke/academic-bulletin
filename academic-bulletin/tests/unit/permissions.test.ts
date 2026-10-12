import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/auth";

const baseUser = {
  id: "user-1",
  email: "hod@example.edu",
  firstName: "Ada",
  lastName: "Dean",
  role: "HOD" as const,
  isActive: true,
  schoolId: "school-1",
  departmentId: "department-1",
};

describe("role permissions", () => {
  it("grants only permissions assigned to the active role", () => {
    expect(hasPermission(baseUser, "edit:submission")).toBe(true);
    expect(hasPermission(baseUser, "manage:users")).toBe(false);
  });

  it("denies every permission to inactive users", () => {
    expect(
      hasPermission({ ...baseUser, isActive: false }, "edit:submission"),
    ).toBe(false);
  });

  it("keeps one role authoritative", () => {
    const admin = { ...baseUser, role: "ADMIN" as const };
    expect(hasPermission(admin, "manage:users")).toBe(true);
    expect(hasPermission(admin, "edit:submission")).toBe(false);
  });
});
