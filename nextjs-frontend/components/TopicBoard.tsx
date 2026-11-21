"use client";

import Link from "next/link";
import { useState } from "react";
import { commentCountLabel, reviewTopic, setTopicSaved, type ReviewAction } from "@/lib/faq-client";
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

function withSaved(list: Topic[], id: number, saved: boolean): Topic[] {
  return list.map((t) => (t.id === id ? { ...t, saved } : t));
}

/** One topic in the list: title link, description, date, comment count and the Save star. */
function TopicCard({ topic, canSave, onToggleSave }: { topic: Topic; canSave: boolean; onToggleSave: () => void }) {
  return (
    <div className={styles.topicCard}>
      <Link href={`/faq/${topic.id}`} className={styles.topicTitle}>
        {topic.title}
      </Link>
      <p className={styles.topicDescription}>{topic.description}</p>
      <div className={styles.topicMeta}>
        <span>{formatDate(topic.created_at)}</span>
        <span className={styles.chip}>{commentCountLabel(topic.comment_count)}</span>
        {canSave && (
          <button
            type="button"
            className={topic.saved ? styles.saveBtnActive : styles.saveBtn}
            onClick={onToggleSave}
            aria-pressed={topic.saved}
          >
            {topic.saved ? "★ Saved" : "☆ Save"}
          </button>
        )}
      </div>
    </div>
  );
}

/** The lecturer's queue of new submissions (SRS-18). */
function PendingReview({ pending, error, onReview }: {
  pending: Topic[];
  error: string;
  onReview: (id: number, action: ReviewAction) => void;
}) {
  return (
    <div className={styles.submitPanel}>
      <h3>Pending review</h3>
      <p className={styles.hint}>New submissions stay hidden from everyone else until you approve or reject them.</p>
      {error && <p className={styles.alert} role="alert">{error}</p>}
      {pending.length > 0 ? (
        pending.map((topic) => (
          <div className={styles.topicCard} key={topic.id}>
            <div className={styles.topicTitle}>{topic.title}</div>
            <p className={styles.topicDescription}>{topic.description}</p>
            <div className={styles.reviewActions}>
              <button type="button" className={styles.btn} onClick={() => onReview(topic.id, "approve")}>Approve</button>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onReview(topic.id, "reject")}>Reject</button>
            </div>
          </div>
        ))
      ) : (
        <p>Nothing waiting on review.</p>
      )}
    </div>
  );
}

export default function TopicBoard({ initialTopics, initialPending, viewer, preview, query }: Props) {
  const [view, setView] = useState<View>("all");
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [savedTopics, setSavedTopics] = useState<Topic[] | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [pending, setPending] = useState<Topic[]>(initialPending);
  const [reviewError, setReviewError] = useState("");

  function markSaved(id: number, saved: boolean) {
    setTopics((list) => withSaved(list, id, saved));
    setSavedTopics((list) => (list ? withSaved(list, id, saved) : list));
  }

  async function toggleSave(topic: Topic) {
    if (!viewer) return;
    const nextSaved = !topic.saved;
    markSaved(topic.id, nextSaved); // optimistic

    if (preview) return;
    if (!(await setTopicSaved(topic.id, nextSaved))) markSaved(topic.id, topic.saved); // revert on failure
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

  async function review(topicId: number, action: ReviewAction) {
    const removeFromQueue = () => setPending((list) => list.filter((t) => t.id !== topicId));
    setReviewError("");
    if (preview) {
      removeFromQueue();
      return;
    }
    const result = await reviewTopic(topicId, action);
    if ("error" in result) {
      setReviewError(result.error);
      if (result.alreadyReviewed) removeFromQueue(); // it is no longer waiting for anyone
      return;
    }
    removeFromQueue();
    if (action === "approve") setTopics((list) => [result.topic, ...list]);
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
          <TopicCard key={topic.id} topic={topic} canSave={!!viewer} onToggleSave={() => toggleSave(topic)} />
        ))
      ) : (
        <p>{view === "saved" ? "You haven't saved any topics yet." : "No matching topics found."}</p>
      )}

      {viewer?.role === "lecturer" && <PendingReview pending={pending} error={reviewError} onReview={review} />}
    </>
  );
}
