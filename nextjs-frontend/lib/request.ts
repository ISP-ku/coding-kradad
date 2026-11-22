// Calls to this app's own /api routes from client components.
import { errorMessage } from "./errors";

export const OFFLINE = "Could not reach the server. Please try again.";

export type Outcome<T> = { data: T } | { error: string };

/**
 * Sends one request and never throws. A JSON body is sent when `body` is
 * given. A failure comes back as `{ error }`: the backend's own message when
 * it sent one, else `fallback`. A 204 reply has no body, so `data` is undefined.
 */
export async function request<T>(url: string, { method = "GET", body, fallback }: {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  fallback: string;
}): Promise<Outcome<T>> {
  try {
    const res = body !== undefined
      ? await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : method === "GET" ? await fetch(url) : await fetch(url, { method });
    if (!res.ok) return { error: await errorMessage(res, fallback) };
    return { data: (res.status === 204 ? undefined : await res.json()) as T };
  } catch {
    return { error: OFFLINE };
  }
}
