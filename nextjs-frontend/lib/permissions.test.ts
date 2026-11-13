import { describe, expect, it } from "vitest";
import { canAccess, effectiveRole, homePathFor, type ProtectedPage } from "./permissions";

type Role = "student" | "ta" | "lecturer";
const user = (role?: Role) => ({ role });

// page -> roles that may open it (mirrors the backend role checks, SRS-18)
const MATRIX: Record<ProtectedPage, Role[]> = {
  dashboard: ["ta", "lecturer"],
  addActivity: ["lecturer"],
  consultations: ["ta"],
  reports: ["lecturer"],
  homework: ["student", "ta", "lecturer"],
  access: ["lecturer"],
};

describe("page permissions", () => {
  for (const [page, allowed] of Object.entries(MATRIX) as [ProtectedPage, Role[]][]) {
    for (const role of ["student", "ta", "lecturer"] as Role[]) {
      it(`${role} ${allowed.includes(role) ? "can" : "cannot"} open ${page}`, () => {
        expect(canAccess(user(role), page)).toBe(allowed.includes(role));
      });
    }
    it(`signed-out visitors cannot open ${page}`, () => {
      expect(canAccess(null, page)).toBe(false);
      expect(canAccess(undefined, page)).toBe(false);
    });
  }

  it("treats a missing or unknown role as a student, never as staff (R-02)", () => {
    expect(effectiveRole(user(undefined))).toBe("student");
    expect(effectiveRole({ role: "admin" as Role })).toBe("student");
    expect(canAccess(user(undefined), "dashboard")).toBe(false);
    expect(canAccess({ role: "admin" as Role }, "reports")).toBe(false);
  });

  it("sends students to the public FAQ and staff to the dashboard", () => {
    expect(homePathFor(user("student"))).toBe("/faq");
    expect(homePathFor(user(undefined))).toBe("/faq");
    expect(homePathFor(user("ta"))).toBe("/dashboard");
    expect(homePathFor(user("lecturer"))).toBe("/dashboard");
  });
});
