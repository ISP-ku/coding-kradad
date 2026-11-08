import type { HomeworkItem } from "./types";

export function formatDue(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** The backend's own message when it sent one (e.g. "already graded"), else our fallback. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "Your account is not allowed to do this.";
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    /* not JSON */
  }
  return fallback;
}

export const byDueDate = (a: HomeworkItem, b: HomeworkItem) =>
  a.due_at === b.due_at ? a.id - b.id : a.due_at < b.due_at ? -1 : 1;

/** `<input type="datetime-local">` gives local wall-clock time; send it as a UTC instant. */
export function localInputToIso(value: string): string | null {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}
