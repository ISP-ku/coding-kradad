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
};

export type AccessData = { courses: AccessCourse[]; accounts: AccessAccount[] };

export const ROLE_LABEL: Record<AccessRole, string> = { student: "Student", ta: "TA", lecturer: "Lecturer" };

/** Same rule as the backend's normalise_ku_email; returns null when invalid. */
export function normaliseKuEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@ku\.th$/.test(email) && email.length <= 200 ? email : null;
}
