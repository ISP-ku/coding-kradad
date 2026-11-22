import { cookies } from "next/headers";
import { backendJson } from "./backend";
import { PREVIEW, previewPendingTopics, previewTopicDetail, previewTopics } from "./preview";
import type { Topic, TopicDetail } from "./types";

/**
 * GETs an FAQ endpoint, forwarding the browser's cookies. The board and
 * topic pages are public, but forwarding the session lets the first render
 * show this viewer's own "saved" stars. Null on any failure, so the page
 * shows an empty or not-found state instead of crashing.
 */
function fetchFaqApi<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  return backendJson<T>(`/api/faq${path}${query}`);
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
