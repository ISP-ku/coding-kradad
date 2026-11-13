"use client";

import { useState, type FormEvent } from "react";
import type { CourseActivity } from "@/lib/types";
import styles from "./ActivityCreateForm.module.css";

const types: { value: CourseActivity["type"]; label: string }[] = [
  { value: "deadline", label: "Deadline" },
  { value: "lab", label: "Lab session" },
  { value: "consultation", label: "Consultation slot" },
  { value: "milestone", label: "Milestone" },
];

function toLocalDateTime(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ActivityEditForm({ activity }: { activity: CourseActivity }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    course_id: activity.course_id, title: activity.title, type: activity.type,
    starts_at: toLocalDateTime(activity.starts_at), location: activity.location,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch(`/api/activities/${activity.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values, starts_at: new Date(values.starts_at).toISOString(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? "Could not update this activity.");
      window.location.assign("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this activity.");
      setSaving(false);
    }
  }

  return <section className={styles.card}>
    <header>
      <h2>Update activity details</h2>
      <p>Existing task assignments and statuses will be kept.</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form className={styles.form} onSubmit={submit}>
      <label>Course ID<input required maxLength={100} value={values.course_id}
        onChange={e => setValues(v => ({ ...v, course_id: e.target.value }))} /></label>
      <label>Activity title<input required maxLength={200} value={values.title}
        onChange={e => setValues(v => ({ ...v, title: e.target.value }))} /></label>
      <div className={styles.row}>
        <label>Activity type<select required value={values.type}
          onChange={e => setValues(v => ({ ...v, type: e.target.value as CourseActivity["type"] }))}>
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select></label>
        <label>Date and time<input required type="datetime-local" value={values.starts_at}
          onChange={e => setValues(v => ({ ...v, starts_at: e.target.value }))} /></label>
      </div>
      <label>Location or meeting link<input required maxLength={200} value={values.location}
        onChange={e => setValues(v => ({ ...v, location: e.target.value }))} /></label>
      <footer>
        <a href="/dashboard">Cancel</a>
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </footer>
    </form>
  </section>;
}
