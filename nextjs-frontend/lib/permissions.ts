import type { SessionUser } from "./types";

type Role = NonNullable<SessionUser["role"]>;

/**
 * Which roles may open each protected page (SRS-18, R-02). The backend is the
 * real gatekeeper for data; this keeps the pages and navigation consistent
 * with it. A signed-in user with no role is treated as a student, never as
 * staff, so a missing role can only ever lose access, not gain it.
 */
const PAGE_ROLES = {
  dashboard: ["ta", "lecturer"],
  addActivity: ["lecturer"],
  consultations: ["ta"],
  reports: ["lecturer"],
  // Everyone signed in sees Homework, but each role gets its own view
  // (student: to do + submit, TA: grade, lecturer: assign).
  homework: ["student", "ta", "lecturer"],
  // Course members and roles (SRS-23); the backend also enforces lecturer-only.
  access: ["lecturer"],
} as const satisfies Record<string, readonly Role[]>;

export type ProtectedPage = keyof typeof PAGE_ROLES;

export const effectiveRole = (user: Pick<SessionUser, "role"> | null | undefined): Role =>
  user?.role === "ta" || user?.role === "lecturer" ? user.role : "student";

export function canAccess(user: Pick<SessionUser, "role"> | null | undefined, page: ProtectedPage): boolean {
  if (!user) return false;
  return (PAGE_ROLES[page] as readonly Role[]).includes(effectiveRole(user));
}

/** Where a signed-in user lands after login or when sent away from a page they cannot use. */
export const homePathFor = (user: Pick<SessionUser, "role"> | null | undefined): string =>
  canAccess(user, "dashboard") ? "/dashboard" : "/faq";
