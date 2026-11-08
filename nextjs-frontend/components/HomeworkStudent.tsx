"use client";

import { useState } from "react";
import { errorMessage, formatDue } from "@/lib/homework";
import type { HomeworkItem, HomeworkSubmission } from "@/lib/types";
import styles from "./Homework.module.css";

type Filter = "all" | "todo" | "submitted" | "graded";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "submitted", label: "Submitted" },
  { key: "graded", label: "Graded" },
  { key: "all", label: "All" },
];

const EMPTY: Record<Filter, string> = {
  todo: "Nothing left to do. You are all caught up!",
  submitted: "You have no homework waiting to be graded.",
  graded: "None of your homework has been graded yet.",
  all: "No homework has been assigned yet.",
};

/** Student view: every homework, a "To do" filter, and a way to hand work in. */
export default function HomeworkStudent({ initial }: { initial: HomeworkItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("todo");
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const count = (key: Filter) => (key === "all" ? items.length : items.filter((h) => h.status === key).length);
  const shown = filter === "all" ? items : items.filter((h) => h.status === filter);

  function open(item: HomeworkItem) {
    setOpenId(item.id);
    setDraft(item.my_submission?.answer ?? "");
    setError(null);
    setNotice(null);
  }

  async function send(e: React.FormEvent, item: HomeworkItem) {
    e.preventDefault();
    if (!draft.trim()) {
      setError({ id: item.id, message: "Please write your answer or paste a link first." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/homework/${item.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: draft.trim() }),
      });
      if (!res.ok) {
        setError({ id: item.id, message: await errorMessage(res, "Could not submit right now. Please try again.") });
        return;
      }
      const saved = (await res.json()) as HomeworkSubmission;
      setItems((list) =>
        list.map((h) => (h.id === item.id ? { ...h, status: "submitted", is_overdue: false, my_submission: saved } : h)),
      );
      setOpenId(null);
      setNotice(`"${item.title}" was submitted. You can find it under Submitted until it is graded.`);
    } catch {
      setError({ id: item.id, message: "Could not reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Page level, not inside the card: a submitted homework leaves the To do list. */}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}{" "}
          <button type="button" className={styles.btnGhost} onClick={() => { setFilter("submitted"); setNotice(null); }}>
            View submitted
          </button>
        </div>
      )}

      <div className={styles.filters} role="group" aria-label="Filter homework">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={styles.filter}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label} ({count(key)})
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className={styles.empty}>{EMPTY[filter]}</p>}

      {shown.map((hw) => {
        const sub = hw.my_submission;
        const graded = hw.status === "graded";
        return (
          <article className={styles.card} key={hw.id} aria-label={hw.title}>
            <div className={styles.head}>
              <div>
                <h3 className={styles.title}>{hw.title}</h3>
                <div className={styles.meta}>
                  <span className={styles.chip}>{hw.course_id}</span>
                  <span>Due {formatDue(hw.due_at)}</span>
                  <span>· {hw.max_score} points</span>
                </div>
              </div>
              {graded && sub ? (
                <span className={`${styles.chip} ${styles.chipGraded}`}>Graded: {sub.score} / {hw.max_score}</span>
              ) : hw.status === "submitted" ? (
                <span className={`${styles.chip} ${styles.chipSubmitted}`}>Submitted, waiting for grade</span>
              ) : hw.is_overdue ? (
                <span className={`${styles.chip} ${styles.chipOverdue}`}>Overdue</span>
              ) : (
                <span className={`${styles.chip} ${styles.chipTodo}`}>To do</span>
              )}
            </div>

            {hw.description && <p className={styles.desc}>{hw.description}</p>}

            {sub && (
              <>
                <span className={styles.answerLabel}>
                  Your answer {sub.is_late && <span className={`${styles.chip} ${styles.chipLate}`}>Submitted late</span>}
                </span>
                <div className={styles.answer}>{sub.answer}</div>
                {graded && sub.feedback && (
                  <p className={styles.feedback}><strong>TA feedback:</strong> {sub.feedback}</p>
                )}
              </>
            )}

            {!graded && openId !== hw.id && (
              <div className={styles.actions}>
                <button type="button" className={styles.btn} onClick={() => open(hw)}>
                  {sub ? "Edit submission" : "Submit homework"}
                </button>
              </div>
            )}

            {openId === hw.id && (
              <form className={styles.form} onSubmit={(e) => send(e, hw)} noValidate>
                <label htmlFor={`answer-${hw.id}`}>Your answer</label>
                <textarea
                  id={`answer-${hw.id}`}
                  value={draft}
                  maxLength={5000}
                  placeholder="Type your answer, or paste a link to your work"
                  onChange={(e) => setDraft(e.target.value)}
                  aria-invalid={error?.id === hw.id ? true : undefined}
                />
                {error?.id === hw.id && <div className={styles.alert} role="alert">{error.message}</div>}
                <div className={styles.actions}>
                  <button type="submit" className={styles.btn} disabled={busy}>
                    {busy ? "Sending..." : "Send"}
                  </button>
                  <button type="button" className={styles.btnGhost} onClick={() => setOpenId(null)}>Cancel</button>
                </div>
              </form>
            )}
          </article>
        );
      })}
    </>
  );
}
