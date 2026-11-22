"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/dates";
import { gradeSubmission, loadSubmissions } from "@/lib/homework-client";
import type { HomeworkItem, HomeworkSubmission } from "@/lib/types";
import styles from "./Homework.module.css";

type Props = {
  homework: HomeworkItem;
  /** TAs grade; lecturers only look. The server enforces this too. */
  canGrade: boolean;
  /** Called the first time a submission gets a score, so counts stay in step. */
  onNewlyGraded: () => void;
};

function Row({ sub, max, canGrade, onSaved }: {
  sub: HomeworkSubmission; max: number; canGrade: boolean; onSaved: (s: HomeworkSubmission) => void;
}) {
  const [score, setScore] = useState(sub.score === null ? "" : String(sub.score));
  const [feedback, setFeedback] = useState(sub.feedback ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const n = Number(score);
    if (!score.trim() || !Number.isInteger(n) || n < 0 || n > max) {
      setError(`Enter a whole-number score from 0 to ${max}.`);
      return;
    }
    setError("");
    setBusy(true);
    const result = await gradeSubmission(sub, n, feedback.trim());
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved(result.submission);
    setSaved(true);
  }

  return (
    <div className={styles.sub} role="group" aria-label={`Submission from ${sub.student_name}`}>
      <div className={styles.head}>
        <strong>{sub.student_name}</strong>
        <div className={styles.meta}>
          <span>Submitted {formatDateTime(sub.submitted_at)}</span>
          {sub.is_late && <span className={`${styles.chip} ${styles.chipLate}`}>Late</span>}
          {sub.score !== null && (
            <span className={`${styles.chip} ${styles.chipGraded}`}>Graded: {sub.score} / {max}</span>
          )}
        </div>
      </div>
      <div className={styles.answer}>{sub.answer}</div>

      {canGrade ? (
        <form className={styles.form} onSubmit={save} noValidate>
          <div className={styles.scoreRow}>
            <div>
              <label htmlFor={`score-${sub.id}`}>Score (max {max})</label>
              <input
                id={`score-${sub.id}`} type="number" inputMode="numeric" min={0} max={max} step={1}
                value={score} onChange={(e) => { setScore(e.target.value); setError(""); setSaved(false); }}
                aria-invalid={error ? true : undefined}
              />
            </div>
            <div>
              <label htmlFor={`feedback-${sub.id}`}>Feedback (optional)</label>
              <input
                id={`feedback-${sub.id}`} type="text" maxLength={1000}
                value={feedback} onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
          </div>
          {error && <div className={styles.alert} role="alert">{error}</div>}
          {saved && <div className={styles.notice} role="status">Grade saved.</div>}
          <div className={styles.actions}>
            <button type="submit" className={styles.btn} disabled={busy}>
              {busy ? "Saving..." : sub.score === null ? "Save grade" : "Update grade"}
            </button>
          </div>
        </form>
      ) : (
        sub.feedback && <p className={styles.feedback}><strong>Feedback:</strong> {sub.feedback}</p>
      )}
    </div>
  );
}

/** Everything students handed in for one homework. */
export default function HomeworkSubmissions({ homework, canGrade, onNewlyGraded }: Props) {
  const [subs, setSubs] = useState<HomeworkSubmission[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadSubmissions(homework.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setSubs(result.submissions);
    });
    return () => { cancelled = true; };
  }, [homework.id]);

  if (error) return <div className={styles.alert} role="alert">{error}</div>;
  if (subs === null) return <p className={styles.empty}>Loading submissions...</p>;
  if (subs.length === 0) return <p className={styles.empty}>No one has submitted this homework yet.</p>;

  return (
    <>
      {subs.map((sub) => (
        <Row
          key={sub.id} sub={sub} max={homework.max_score} canGrade={canGrade}
          onSaved={(updated) => {
            if (sub.score === null) onNewlyGraded();
            setSubs((list) => (list ?? []).map((s) => (s.id === updated.id ? updated : s)));
          }}
        />
      ))}
    </>
  );
}
