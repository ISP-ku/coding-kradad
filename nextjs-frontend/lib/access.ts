/** Course membership and roles managed on the lecturer Access page (SRS-23). */
export type AccessRole = "student" | "ta" | "lecturer";

export type AccessCourse = { id: number; code: string; name: string };

export type AccessAccount = {
  email: string;
  role: AccessRole;
  course_ids: number[];
  /** Set in LECTURER_EMAILS on the server: always a lecturer, cannot be changed here. */
  protected: boolean;
  /** The signed-in lecturer: cannot remove or demote themselves. */
  is_self: boolean;
  /** A lecturer-made sign-in password exists (for people KU ALL blocks). */
  has_password: boolean;
};

export type AccessData = { courses: AccessCourse[]; accounts: AccessAccount[] };

export const ROLE_LABEL: Record<AccessRole, string> = { student: "Student", ta: "TA", lecturer: "Lecturer" };

/**
 * Any valid address a lecturer may add, lower-cased, or null. Same rule as the
 * backend's normalise_member_email: one @, something before it, a domain with
 * a dot and no empty parts, no spaces, at most 200 characters.
 */
export function normaliseMemberEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const [local, domain, ...rest] = email.split("@");
  const labels = (domain ?? "").split(".");
  const ok = rest.length === 0 && !!local && labels.length >= 2 && labels.every(Boolean)
    && !/\s/.test(email) && email.length <= 200;
  return ok ? email : null;
}

/** KU addresses can use Google sign-in; anyone else signs in with a lecturer-made password. */
export const isKuEmail = (email: string) => email.trim().toLowerCase().split("@").pop() === "ku.th";

/** The confirmation shown on the Access page after someone is added. */
export function addedNotice(email: string, courseCode?: string): string {
  const base = `${email} now has access${courseCode ? ` to ${courseCode}` : ""}.`;
  return isKuEmail(email)
    ? base
    : `${base} Without a @ku.th address they can only sign in with a password: click Create password next to their name.`;
}
