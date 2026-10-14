"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { ActivityAssignee } from "@/lib/types";
import styles from "./ActivityCreateForm.module.css";

export default function ActivityCreateForm({ assignees }: { assignees: ActivityAssignee[] }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const startsAt = new Date(`${String(form.get("date"))}T${String(form.get("time"))}`);
    try {
      const response = await fetch("/api/activities", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course_id: form.get("course_id"), title: form.get("title"), type: form.get("type"),
          starts_at: startsAt.toISOString(), location: form.get("location"), assignee_id: form.get("assignee_id"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not save this activity.");
      window.location.assign("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this activity.");
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.card}>
    <header><span className={styles.eyebrow}>ACTIVITY DETAILS</span><h2>What needs to happen?</h2><p>Required information is saved to the shared course schedule.</p></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form className={styles.form} onSubmit={submit}>
      <label>Course ID<input name="course_id" required maxLength={100} placeholder="e.g. 01219245" /></label>
      <label>Activity title<input name="title" required maxLength={200} placeholder="e.g. Submit Lab 4 report" /></label>
      <div className={styles.row}>
        <label>Activity type<select name="type" required defaultValue=""><option value="" disabled>Select type</option><option value="deadline">Deadline</option><option value="lab">Lab session</option><option value="consultation">Consultation slot</option><option value="milestone">Milestone</option></select></label>
        <label>Assign to TA<select name="assignee_id" required defaultValue=""><option value="" disabled>Select an active TA</option>{assignees.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      </div>
      <div className={styles.row}>
        <label>Date<input type="date" name="date" required /></label>
        <label>Time<input type="time" name="time" required /></label>
      </div>
      <label>Location or meeting link<input name="location" required maxLength={200} placeholder="Room or online link" /></label>
      {assignees.length === 0 && <p className={styles.helper}>No active TA accounts are available to assign yet. A lecturer can add TAs after their KU accounts are registered.</p>}
      <footer><a href="/dashboard">Cancel</a><button type="submit" disabled={saving || assignees.length === 0}>{saving ? "Saving…" : "Save and assign"}</button></footer>
    </form>
  </section>;
}
