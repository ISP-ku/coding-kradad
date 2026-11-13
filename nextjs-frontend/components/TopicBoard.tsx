"use client";

import Link from "next/link";
import { useState } from "react";
import type { SessionUser, Topic } from "@/lib/types";
import styles from "./TopicBoard.module.css";

type Props = {
  initialTopics: Topic[];
  initialPending: Topic[];
  viewer: SessionUser | null;
  preview: boolean;
  query: string;
};

type View = "all" | "saved";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function TopicBoard({ initialTopics, initialPending, viewer, preview, query }: Props) {
  const [view, setView] = useState<View>("all");
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [savedTopics, setSavedTopics] = useState<Topic[] | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [pending, setPending] = useState<Topic[]>(initialPending);


  function markSaved(id: number, saved: boolean) {
    setTopics((list) => list.map((t) => (t.id === id ? { ...t, saved } : t)));
    setSavedTopics((list) => (list ? list.map((t) => (t.id === id ? { ...t, saved } : t)) : list));
  }

  async function toggleSave(topic: Topic) {
    if (!viewer) return;
    const nextSaved = !topic.saved;
    markSaved(topic.id, nextSaved); // optimistic

    if (preview) return;
    try {
      const res = await fetch(`/api/faq/${topic.id}/save`, { method: nextSaved ? "POST" : "DELETE" });
      if (!res.ok) markSaved(topic.id, topic.saved); // revert on failure
    } catch {
      markSaved(topic.id, topic.saved);
    }
  }

  async function showSaved() {
    setView("saved");
    if (savedTopics !== null || preview) return;
    setSavedLoading(true);
    try {
      const res = await fetch("/api/faq/saved");
      setSavedTopics(res.ok ? ((await res.json()) as Topic[]) : []);
    } catch {
      setSavedTopics([]);
    } finally {
      setSavedLoading(false);
    }
  }

  async function review(topicId: number, action: "approve" | "reject") {
    if (preview) {
      setPending((list) => list.filter((t) => t.id !== topicId));
      return;
    }
    const res = await fetch(`/api/faq/${topicId}/${action}`, { method: "POST" });
    if (!res.ok) return;
    const updated = (await res.json()) as Topic;
    setPending((list) => list.filter((t) => t.id !== topicId));
    if (action === "approve") setTopics((list) => [updated, ...list]);
  }

  const shown = view === "all" ? topics : savedTopics ?? [];

  return (
    <>
      <form className={styles.searchBox} method="get" action="/faq">
        <input type="text" aria-label="Search topics" name="q" placeholder="Search title or description..." defaultValue={query} />
        <button type="submit" className={styles.btn}>Search</button>
      </form>

      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? styles.tabActive : styles.tab} onClick={() => setView("all")}>
          All topics
        </button>
        {viewer && (
          <button type="button" role="tab" aria-selected={view === "saved"} className={view === "saved" ? styles.tabActive : styles.tab} onClick={showSaved}>
            Saved topics
          </button>
        )}
      </div>

      {view === "saved" && savedLoading ? (
        <p>Loading your saved topics...</p>
      ) : shown.length > 0 ? (
        shown.map((topic) => (
          <div className={styles.topicCard} key={topic.id}>
            <Link href={`/faq/${topic.id}`} className={styles.topicTitle}>
              {topic.title}
            </Link>
            <p className={styles.topicDescription}>{topic.description}</p>
            <div className={styles.topicMeta}>
              <span>{formatDate(topic.created_at)}</span>
              <span className={styles.chip}>{topic.comment_count} {topic.comment_count === 1 ? "comment" : "comments"}</span>
              {viewer && (
                <button
                  type="button"
                  className={topic.saved ? styles.saveBtnActive : styles.saveBtn}
                  onClick={() => toggleSave(topic)}
                  aria-pressed={topic.saved}
                >
                  {topic.saved ? "★ Saved" : "☆ Save"}
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <p>{view === "saved" ? "You haven't saved any topics yet." : "No matching topics found."}</p>
      )}


      {viewer?.role === "lecturer" && (
        <div className={styles.submitPanel}>
          <h3>Pending review</h3>
          <p className={styles.hint}>New submissions stay hidden from everyone else until you approve or reject them.</p>
          {pending.length > 0 ? (
            pending.map((topic) => (
              <div className={styles.topicCard} key={topic.id}>
                <div className={styles.topicTitle}>{topic.title}</div>
                <p className={styles.topicDescription}>{topic.description}</p>
                <div className={styles.reviewActions}>
                  <button type="button" className={styles.btn} onClick={() => review(topic.id, "approve")}>Approve</button>
                  <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => review(topic.id, "reject")}>Reject</button>
                </div>
              </div>
            ))
          ) : (
            <p>Nothing waiting on review.</p>
          )}
        </div>
      )}
    </>
  );
}
