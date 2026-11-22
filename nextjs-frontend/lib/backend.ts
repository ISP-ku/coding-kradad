// Server-side calls to the FastAPI backend as the signed-in browser.
// Server components and route handlers only: this reads next/headers.
import { cookies } from "next/headers";
import { API_BASE } from "./api";

/** The browser's cookies as one Cookie header, so the backend sees the same session. */
export function forwardedCookies(): string {
  return cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
}

/** fetch() a backend path (e.g. "/api/homework") with the browser's cookies. Never cached. */
export function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), cookie: forwardedCookies() },
    cache: "no-store",
  });
}

/** GET a backend JSON endpoint. Null on any failure, so the page can show an empty or error state. */
export async function backendJson<T>(path: string): Promise<T | null> {
  try {
    const res = await backendFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
