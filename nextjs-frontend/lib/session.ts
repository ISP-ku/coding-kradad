import { cookies } from "next/headers";
import type { SessionUser } from "./types";
import { API_BASE } from "./api";
import { PREVIEW, PREVIEW_COOKIE, makePreviewUser } from "./preview";

/**
 * Reads the current user from the backend, forwarding whatever session
 * cookie the backend set. Returns null when logged out (or backend is down).
 *
 * Uses the FastAPI /api/me endpoint; unsigned preview cookies are ignored in real mode.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = cookies();

  if (PREVIEW) {
    const provider = jar.get(PREVIEW_COOKIE)?.value;
    return provider === "google" ? makePreviewUser() : null;
  }

  const session = jar.get("ku_session")?.value;
  if (!session) return null;
  const cookieHeader = `ku_session=${session}`;

  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}
