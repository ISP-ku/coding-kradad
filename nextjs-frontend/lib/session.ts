import { cookies } from "next/headers";
import type { SessionUser } from "./types";
import { API_BASE } from "./api";
import { PREVIEW, PREVIEW_COOKIE, makePreviewUser } from "./preview";

/**
 * Reads the current user from the backend, forwarding whatever session
 * cookie the backend set. Returns null when logged out (or backend is down).
 *
 * TODO: confirm the real endpoint name/shape once the FastAPI side lands —
 * this assumes a `GET /api/me` that 401s when there's no session.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = cookies();

  if (PREVIEW) {
    const provider = jar.get(PREVIEW_COOKIE)?.value;
    return provider ? makePreviewUser(provider) : null;
  }

  const cookieHeader = jar.toString();
  if (!cookieHeader) return null;

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
