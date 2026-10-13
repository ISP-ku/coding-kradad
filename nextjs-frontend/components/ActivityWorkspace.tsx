"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./ActivityWorkspace.module.css";

type Activity = { id: string; title: string; type: string; date: string; time: string; location: string; assignee: string; assignedAt: string; status: string };
type Consultation = { id: string; date: string; duration: number; topic: string; participants: string; recordedBy: string; recordedAt: string };
const storageKey = "course-support-sg2-v1";
const tas = ["Alex Morgan", "Jamie Lee", "Taylor Kim"];

export default function ActivityWorkspace({ viewerName }: { viewerName: string }) {
  const [role, setRole] = useState<"Lecturer" | "TA">("Lecturer");
  const [activeTA, setActiveTA] = useState(tas[0]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setActivities(Array.isArray(parsed.activities) ? parsed.activities : []);
        setConsultations(Array.isArray(parsed.consultations) ? parsed.consultations : []);
      }
    } catch { /* Start with an empty workspace if saved demo data is invalid. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify({ activities, consultations }));
  }, [activities, consultations, ready]);

  const visibleActivities = useMemo(() => role === "Lecturer" ? activities : activities.filter((item) => item.assignee === activeTA), [activities, role, activeTA]);
  const visibleConsultations = useMemo(() => role === "Lecturer" ? consultations : consultations.filter((item) => item.recordedBy === activeTA), [consultations, role, activeTA]);

  function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role !== "Lecturer") return;
    const form = new FormData(event.currentTarget);
    const entry: Activity = {
      id: crypto.randomUUID(), title: String(form.get("title")).trim(), type: String(form.get("type")),
      date: String(form.get("date")), time: String(form.get("time")), location: String(form.get("location")).trim(),
      assignee: String(form.get("assignee")), assignedAt: new Date().toISOString(), status: "To do",
    };
    setActivities((current) => [entry, ...current]);
    setNotice(`“${entry.title}” saved and added to ${entry.assignee}’s schedule.`);
    event.currentTarget.reset();
  }

  function recordConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entry: Consultation = {
      id: crypto.randomUUID(), date: String(form.get("consultDate")), duration: Number(form.get("duration")),
      topic: String(form.get("topic")).trim(), participants: String(form.get("participants")).trim(),
      recordedBy: role === "TA" ? activeTA : viewerName, recordedAt: new Date().toISOString(),
    };
    setConsultations((current) => [entry, ...current]);
    setNotice("Consultation saved to your history.");
    event.currentTarget.reset();
  }

  function updateStatus(id: string, status: string) {
    setActivities((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    setNotice("Task status updated.");
  }

  return <div className={styles.workspace}>
    <div className={styles.controls}>
      <div><span className={styles.eyebrow}>SG-2 · ACTIVITY MANAGEMENT</span><h2>Tasks &amp; consultations</h2></div>
      <label className={styles.roleLabel}>Preview role <select value={role} onChange={(e) => { setRole(e.target.value as "Lecturer" | "TA"); setNotice(""); }}><option>Lecturer</option><option>TA</option></select></label>
      {role === "TA" && <label className={styles.roleLabel}>TA profile <select value={activeTA} onChange={(e) => setActiveTA(e.target.value)}>{tas.map((ta) => <option key={ta}>{ta}</option>)}</select></label>}
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.columns}>
      <section className={styles.card}>
        <h3>{role === "Lecturer" ? "Create and assign activity" : "Your assigned tasks"}</h3>
        {role === "Lecturer" ? <form className={styles.form} onSubmit={createActivity}>
          <label>Title<input name="title" required maxLength={120} placeholder="e.g. Prepare Lab 4 materials" /></label>
          <div className={styles.row}>
            <label>Type<select name="type" required defaultValue=""><option value="" disabled>Select type</option><option>Deadline</option><option>Lab session</option><option>Consultation slot</option><option>Milestone</option><option>Task</option></select></label>
            <label>Assign to active TA<select name="assignee" required>{tas.map((ta) => <option key={ta}>{ta}</option>)}</select></label>
          </div>
          <div className={styles.row}><label>Date<input type="date" name="date" required /></label><label>Time<input type="time" name="time" required /></label></div>
          <label>Location<input name="location" required maxLength={120} placeholder="Room or online link" /></label>
          <button className={styles.primary} type="submit">Save and assign</button>
          <small>Required details are checked before saving. Assignment time is recorded automatically.</small>
        </form> : <p className={styles.helper}>Activities assigned to {activeTA} appear here as soon as they are saved.</p>}
      </section>
      <section className={styles.card}>
        <h3>{role === "TA" ? "Record consultation" : "Consultation log"}</h3>
        {role === "TA" ? <form className={styles.form} onSubmit={recordConsultation}>
          <label>Date<input type="date" name="consultDate" required /></label>
          <label>Duration (minutes)<input type="number" name="duration" min="1" max="1440" required placeholder="30" /></label>
          <label>Topic<input name="topic" required maxLength={160} placeholder="What was discussed?" /></label>
          <label>Participant(s)<input name="participants" required maxLength={200} placeholder="Student names or IDs" /></label>
          <button className={styles.primary} type="submit">Save consultation</button>
          <small>Saved sessions appear in this TA’s history.</small>
        </form> : <p className={styles.helper}>Switch to a TA profile to record a consultation and view that TA’s history.</p>}
      </section>
    </div>
    <section className={styles.card + " " + styles.listCard}>
      <div className={styles.listHeading}><h3>{role === "Lecturer" ? "Shared activity schedule" : `${activeTA}’s schedule`}</h3><span>{visibleActivities.length} activities</span></div>
      {visibleActivities.length ? <div className={styles.entries}>{visibleActivities.map((item) => <article className={styles.entry} key={item.id}>
        <div className={styles.dateBlock}><strong>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en", { day: "2-digit" })}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en", { month: "short" })}</span></div>
        <div className={styles.entryInfo}><strong>{item.title}</strong><span>{item.type} · {item.time} · {item.location}</span><small>Assigned to {item.assignee} · {new Date(item.assignedAt).toLocaleString()}</small></div>
        <label className={styles.status}>Status<select value={item.status} disabled={role === "Lecturer"} onChange={(e) => updateStatus(item.id, e.target.value)}><option>To do</option><option>In progress</option><option>Done</option></select></label>
      </article>)}</div> : <p className={styles.empty}>No activities yet. {role === "Lecturer" ? "Create one above to add it to the assigned TA’s schedule." : "Your assigned activities will appear here."}</p>}
    </section>
    <section className={styles.card + " " + styles.listCard}>
      <div className={styles.listHeading}><h3>{role === "TA" ? "Your consultation history" : "Consultation history"}</h3><span>{visibleConsultations.length} sessions</span></div>
      {visibleConsultations.length ? <div className={styles.entries}>{visibleConsultations.map((item) => <article className={styles.entry} key={item.id}><div className={styles.dateBlock}><strong>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en", { day: "2-digit" })}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en", { month: "short" })}</span></div><div className={styles.entryInfo}><strong>{item.topic}</strong><span>{item.duration} minutes · Participants: {item.participants}</span><small>Recorded by {item.recordedBy} · {new Date(item.recordedAt).toLocaleString()}</small></div></article>)}</div> : <p className={styles.empty}>No consultation sessions recorded yet.</p>}
    </section>
  </div>;
}
