/**
 * Access page calls for client components (lecturer only, SRS-23). None of
 * them throw: each returns `{ data }` or `{ error }` with a message to show.
 */
import type { AccessAccount, AccessCourse, AccessRole } from "./access";
import { request, type Outcome } from "./request";

const account = (email: string) => `/api/access/accounts/${encodeURIComponent(email)}`;

export function createCourse(code: string, name: string | null): Promise<Outcome<AccessCourse>> {
  return request("/api/access/courses", { method: "POST", body: { code, name }, fallback: "Could not create the course." });
}

export function addMember(courseId: number, email: string, role: AccessRole): Promise<Outcome<AccessAccount>> {
  return request(`/api/access/courses/${courseId}/members`, {
    method: "POST", body: { email, role }, fallback: "Could not add this account.",
  });
}

export function removeMember(courseId: number, email: string): Promise<Outcome<void>> {
  return request(`/api/access/courses/${courseId}/members/${encodeURIComponent(email)}`, {
    method: "DELETE", fallback: "Could not remove this account.",
  });
}

export function changeRole(email: string, role: AccessRole): Promise<Outcome<AccessAccount>> {
  return request(account(email), { method: "PATCH", body: { role }, fallback: "Could not change the role." });
}

/** The new password is in this reply only; the server keeps just its hash. */
export function createPassword(email: string): Promise<Outcome<{ password: string; account: AccessAccount }>> {
  return request(`${account(email)}/password`, { method: "POST", fallback: "Could not create a password." });
}

export function removePassword(email: string): Promise<Outcome<AccessAccount>> {
  return request(`${account(email)}/password`, { method: "DELETE", fallback: "Could not remove the password." });
}
