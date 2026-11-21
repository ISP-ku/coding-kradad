/**
 * FAQ helpers for client components. lib/faq.ts reads cookies through
 * next/headers, so it can only run on the server and cannot hold these.
 */
import type { Comment, Topic } from "./types";

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

export type PostCommentResult = { comment: Comment } | { error: string };

/** Add a comment to a Published topic. Never throws: failures come back as a message for the form. */
export async function postComment(topicId: number, body: string): Promise<PostCommentResult> {
  try {
    const res = await fetch(`/api/faq/${topicId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.status === 401) return { error: "Please sign in to comment." };
    if (!res.ok) return { error: "Could not post your comment. Please try again." };
    return { comment: (await res.json()) as Comment };
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }
}

export type ReviewAction = "approve" | "reject";
export type ReviewResult = { topic: Topic } | { error: string; alreadyReviewed?: boolean };

/** Approve or reject a Pending topic (lecturer only). Never throws. */
export async function reviewTopic(topicId: number, action: ReviewAction): Promise<ReviewResult> {
  try {
    const res = await fetch(`/api/faq/${topicId}/${action}`, { method: "POST" });
    if (res.status === 409) {
      return { error: "Another lecturer has already reviewed this topic. Reload the page to see the result.", alreadyReviewed: true };
    }
    if (!res.ok) return { error: `Could not ${action} this topic. Please try again.` };
    return { topic: (await res.json()) as Topic };
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }
}
