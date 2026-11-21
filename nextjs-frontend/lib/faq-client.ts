/**
 * FAQ helpers for client components. lib/faq.ts reads cookies through
 * next/headers, so it can only run on the server and cannot hold these.
 */

/** Bookmark or un-bookmark a topic. True when the server accepted it. */
export async function setTopicSaved(topicId: number, saved: boolean): Promise<boolean> {
  try {
    const res = await fetch(`/api/faq/${topicId}/save`, { method: saved ? "POST" : "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export function commentCountLabel(count: number): string {
  return `${count} ${count === 1 ? "comment" : "comments"}`;
}
