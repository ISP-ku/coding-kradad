"use client";

import { useState } from "react";
import styles from "./TopicBoard.module.css";

type Props = {
  preview?: boolean;
  /** Called after a successful send; without it the page returns to the board. */
  onSubmitted?: () => void;
};

/** Start a new FAQ topic (SRS-16, SRS-17). It stays Pending until a lecturer approves it (SRS-18). */
export default function TopicForm({ preview = false, onSubmitted }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function done() {
    if (onSubmitted) onSubmitted();
    else window.location.assign("/faq?submitted=1");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!title.trim() || !description.trim()) {
      setError("Please fill in both the title and the description.");
      return;
    }
    if (preview) {
      setNotice("Sent (preview mode: this is not saved).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      if (res.status === 401) {
        setError("Please sign in to create a topic.");
        return;
      }
      if (!res.ok) {
        setError("The topic could not be saved. Please check both fields and try again.");
        return;
      }
      done();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.submitPanel} onSubmit={submit} noValidate aria-label="New topic">
      <p className={styles.hint}>
        New topics are saved as Pending and only appear on the board after a lecturer approves them.
      </p>
      <label htmlFor="topic-title">Title</label>
      <input id="topic-title" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. When is the midterm project due?" maxLength={300} />
      <label htmlFor="topic-description">Description</label>
      <textarea id="topic-description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Add any detail that would help someone answer." maxLength={2000} />
      {error && <div className={styles.alert} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      <button type="submit" className={styles.btn} disabled={submitting}>
        {submitting ? "Sending..." : "Send for approval"}
      </button>
    </form>
  );
}
