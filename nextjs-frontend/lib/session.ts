import { cookies } from "next/headers";
import type { SessionUser } from "./types";

// Points at the FastAPI backend (source/app.py on the
// backend/fastapi-conversion branch). Set this in .env.local.
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

/**
 * Reads the current user from the backend, forwarding whatever session
 * cookie Flask/FastAPI set. Returns null when logged out.
 *
 * TODO: confirm the real endpoint name/shape once the FastAPI side lands —
 * this assumes a `GET /api/me` that 401s when there's no session.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieHeader = cookies().toString();
  if (!cookieHeader) return null;

  const res = await fetch(`${API_BASE}/api/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });

  if (!res.ok) return null;
  return (await res.json()) as SessionUser;
}
