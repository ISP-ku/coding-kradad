"use client";

import { useState } from "react";
import { errorMessage, localInputToIso } from "@/lib/homework";
import type { HomeworkItem } from "@/lib/types";
import styles from "./Homework.module.css";

type Errors = Partial<Record<"course_id" | "title" | "due_at" | "max_score", string>>;

/**
 * Lecturer-only form that assigns a new homework to the whole course. It has
 * its own page (/homework/new); after assigning it returns to the homework list
 * unless a caller handles the new item itself.
 */
export default function HomeworkAssignForm({ onCreated }: { onCreated?: (item: HomeworkItem) => void }) {
  const [course, setCourse] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [max, setMax] = useState("100");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    setFormError("");
    const found: Errors = {};
    if (!course.trim()) found.course_id = "Please enter the course code.";
    if (!title.trim()) found.title = "Please enter a title.";
    const dueIso = localInputToIso(due);
    if (!dueIso) found.due_at = "Please pick the due date and time.";
    const points = Number(max);
    if (!Number.isInteger(points) || points < 1 || points > 1000) found.max_score = "Enter a whole number from 1 to 1000.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const res = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.trim(), title: title.trim(), description: description.trim(),
          due_at: dueIso, max_score: points,
        }),
      });
      if (!res.ok) {
        setFormError(await errorMessage(res, "Could not assign the homework. Please check every field."));
        return;
      }
      const created = (await res.json()) as HomeworkItem;
      if (!onCreated) {
        window.location.assign("/homework?assigned=1");
        return;
      }
      onCreated(created);
      setCourse(""); setTitle(""); setDescription(""); setDue(""); setMax("100");
      setNotice("Homework assigned. Students can see it now.");
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const err = (id: keyof Errors) => errors[id] && <span className={styles.fieldError} id={`${id}-error`}>{errors[id]}</span>;
  const aria = (id: keyof Errors) => ({
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? `${id}-error` : undefined,
  });

  return (
    <form className={`${styles.panel} ${styles.form}`} onSubmit={submit} noValidate aria-label="Assign homework">
      <div className={styles.grid}>
        <div>
          <label htmlFor="hw-course">Course</label>
          <input id="hw-course" value={course} maxLength={100} placeholder="e.g. 01219245"
            onChange={(e) => setCourse(e.target.value)} {...aria("course_id")} />
          {err("course_id")}
        </div>
        <div>
          <label htmlFor="hw-title">Title</label>
          <input id="hw-title" value={title} maxLength={200} placeholder="e.g. HW1 - ER Diagram"
            onChange={(e) => setTitle(e.target.value)} {...aria("title")} />
          {err("title")}
        </div>
        <div className={styles.full}>
          <label htmlFor="hw-desc">Instructions (optional)</label>
          <textarea id="hw-desc" value={description} maxLength={2000}
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="hw-due">Due date and time</label>
          <input id="hw-due" type="datetime-local" value={due}
            onChange={(e) => setDue(e.target.value)} {...aria("due_at")} />
          {err("due_at")}
        </div>
        <div>
          <label htmlFor="hw-max">Maximum score</label>
          <input id="hw-max" type="number" inputMode="numeric" min={1} max={1000} step={1} value={max}
            onChange={(e) => setMax(e.target.value)} {...aria("max_score")} />
          {err("max_score")}
        </div>
      </div>
      {formError && <div className={styles.alert} role="alert">{formError}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      <div className={styles.actions}>
        <button type="submit" className={styles.btn} disabled={busy}>{busy ? "Assigning..." : "Assign homework"}</button>
      </div>
    </form>
  );
}
