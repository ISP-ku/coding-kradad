"use client";

import { useState } from "react";
import { byDueDate, formatDue } from "@/lib/homework";
import type { HomeworkItem } from "@/lib/types";
import HomeworkAssignForm from "./HomeworkAssignForm";
import HomeworkSubmissions from "./HomeworkSubmissions";
import styles from "./Homework.module.css";

type Filter = "all" | "needs";

const waiting = (h: HomeworkItem) => (h.submission_count ?? 0) - (h.graded_count ?? 0);

/**
 * Staff view of homework.
 *  TA       - sees submissions and grades them
 *  lecturer - assigns homework and can read submissions (no grading)
 */
export default function HomeworkStaff({ initial, role }: { initial: HomeworkItem[]; role: "ta" | "lecturer" }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>(role === "ta" ? "needs" : "all");
  const [openId, setOpenId] = useState<number | null>(null);

  const needs = items.filter((h) => waiting(h) > 0);
  // A homework the TA has open stays on screen even after its last submission is
  // graded, so "Grade saved" doesn't vanish mid-review. It leaves the list once closed.
  const shown = filter === "needs" ? items.filter((h) => waiting(h) > 0 || h.id === openId) : items;

  const bumpGraded = (id: number) =>
    setItems((list) => list.map((h) => (h.id === id ? { ...h, graded_count: (h.graded_count ?? 0) + 1 } : h)));

  return (
    <>
      {role === "lecturer" && (
        <HomeworkAssignForm onCreated={(item) => setItems((list) => [...list, item].sort(byDueDate))} />
      )}

      <h2 className={styles.sectionTitle}>Course homework</h2>
      <div className={styles.filters} role="group" aria-label="Filter homework">
        <button type="button" className={styles.filter} aria-pressed={filter === "needs"} onClick={() => setFilter("needs")}>
          Needs grading ({needs.length})
        </button>
        <button type="button" className={styles.filter} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          All ({items.length})
        </button>
      </div>

      {shown.length === 0 && (
        <p className={styles.empty}>
          {filter === "needs" ? "Nothing is waiting to be graded." : "No homework has been assigned yet."}
        </p>
      )}

      {shown.map((hw) => (
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
            <span className={`${styles.chip} ${waiting(hw) > 0 ? styles.chipSubmitted : styles.chipOk}`}>
              {hw.submission_count ?? 0} submitted · {hw.graded_count ?? 0} graded
            </span>
          </div>
          {hw.description && <p className={styles.desc}>{hw.description}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={openId === hw.id ? styles.btnGhost : styles.btn}
              aria-expanded={openId === hw.id}
              onClick={() => setOpenId(openId === hw.id ? null : hw.id)}
            >
              {openId === hw.id ? "Hide submissions" : role === "ta" ? "Review & grade" : "View submissions"}
            </button>
          </div>

          {openId === hw.id && (
            <HomeworkSubmissions homework={hw} canGrade={role === "ta"} onNewlyGraded={() => bumpGraded(hw.id)} />
          )}
        </article>
      ))}
    </>
  );
}
