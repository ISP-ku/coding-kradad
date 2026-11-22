// Safe in client components: no server-only imports.
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
