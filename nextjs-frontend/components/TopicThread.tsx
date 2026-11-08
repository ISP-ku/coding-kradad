"use client";

import Link from "next/link";
import { useState } from "react";
import type { Comment, SessionUser, TopicDetail } from "@/lib/types";
import styles from "./TopicThread.module.css";

type Props = {
  topic: TopicDetail;
  viewer: SessionUser | null;
  preview: boolean;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TopicThread({ topic, viewer, preview }: Props) {
  const [saved, setSaved] = useState(topic.saved);
  const [comments, setComments] = useState<Comment[]>(topic.comments);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function toggleSave() {
    if (!viewer) return;
    const next = !saved;
    setSaved(next); // optimistic

    if (preview) return;
    try {
      const res = await fetch(`/api/faq/${topic.id}/save`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    }
  }

  async function onSubmitComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!body.trim()) {
      setError("Please write a comment first.");
      return;
    }

    setSubmitting(true);
    try {
      if (preview) {
        setComments((list) => [
          ...list,
          { id: list.length + 1, author: viewer ? viewer.username : "You", body: body.trim(), created_at: new Date().toISOString() },
        ]);
      } else {
        const res = await fetch(`/api/faq/${topic.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        });
        if (res.status === 401) {
          setError("Please sign in to comment.");
          return;
        }
        if (!res.ok) {
          setError("Could not post your comment. Please try again.");
          return;
        }
        const saved_comment = (await res.json()) as Comment;
        setComments((list) => [...list, saved_comment]);
      }
      setBody("");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Link href="/faq" className={styles.backLink}>← Back to FAQ / Issue Log</Link>

      <div className={styles.topicCard}>
        <div className={styles.topicHeader}>
          <h2>{topic.title}</h2>
          {viewer && (
            <button type="button" className={saved ? styles.saveBtnActive : styles.saveBtn} onClick={toggleSave} aria-pressed={saved}>
              {saved ? "★ Saved" : "☆ Save"}
            </button>
          )}
        </div>
        <p className={styles.description}>{topic.description}</p>
        <div className={styles.meta}>
          <span>{formatDate(topic.created_at)}</span>
          <span className={styles.chip}>{comments.length} {comments.length === 1 ? "comment" : "comments"}</span>
        </div>
      </div>

      <h3 className={styles.commentsHeading}>Discussion</h3>
      {comments.length > 0 ? (
        comments.map((comment) => (
          <div className={styles.comment} key={comment.id}>
            <div className={styles.commentMeta}>
              <span>{comment.author}</span>
              <span>{formatDate(comment.created_at)}</span>
            </div>
            <p>{comment.body}</p>
          </div>
        ))
      ) : (
        <p className={styles.empty}>No comments yet. Be the first to reply.</p>
      )}

      <div className={styles.commentPanel}>
        {viewer ? (
          <form onSubmit={onSubmitComment}>
            <label htmlFor="body">Add a comment</label>
            <textarea id="body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share what you know..." maxLength={2000} />
            {error && <div className={styles.alert} role="alert">{error}</div>}
            <button type="submit" className={styles.btn} disabled={submitting}>
              {submitting ? "Posting..." : "Post comment"}
            </button>
          </form>
        ) : (
          <p>
            Please <Link href="/">sign in</Link> to join the discussion.
          </p>
        )}
      </div>
    </>
  );
}
