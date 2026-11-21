import { cookies } from "next/headers";
import { API_BASE } from "./api";
import { PREVIEW, previewPendingTopics, previewTopicDetail, previewTopics } from "./preview";
import type { Topic, TopicDetail } from "./types";

/**
 * GETs an FAQ endpoint from the server, forwarding the browser's cookies.
 * The board and topic pages are public, but forwarding the session lets
 * the first render show this viewer's own "saved" stars. Returns null on
 * any failure so the page can show an empty or not-found state instead
 * of crashing.
 */
async function fetchFaqApi<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  try {
    const url = new URL(`${API_BASE}/api/faq${path}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

    const res = await fetch(url, {
      headers: { cookie: cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ") },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Published topics matching the keyword, newest first (SRS-16). */
export async function getTopics(query: string): Promise<Topic[]> {
  if (PREVIEW) {
    const q = query.trim().toLowerCase();
    return previewTopics.filter(
      (t) =>
        t.status === "Published" &&
        (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
  }
  return (await fetchFaqApi<Topic[]>("", query ? { q: query } : undefined)) ?? [];
}

/** One Published topic with its comments, or null if it doesn't exist or isn't public yet. */
export async function getTopicDetail(id: string): Promise<TopicDetail | null> {
  if (PREVIEW) return previewTopicDetail(Number(id));
  return fetchFaqApi<TopicDetail>(`/${encodeURIComponent(id)}`);
}

/**
 * Topics awaiting lecturer review (SRS-18). Lecturer-only on the backend,
 * so a signed-out visitor skips the request entirely.
 */
export async function getPendingTopics(): Promise<Topic[]> {
  if (PREVIEW) return previewPendingTopics;
  if (!cookies().get("ku_session")) return [];
  return (await fetchFaqApi<Topic[]>("/pending")) ?? [];
}
