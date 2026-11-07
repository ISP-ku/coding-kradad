"use client";

import { useState } from "react";
import type { CourseActivity } from "@/lib/types";
import styles from "./ActivityWorkspace.module.css";

type Role = "student" | "ta" | "lecturer";
type Props = { initialActivities: CourseActivity[]; initialError?: string; viewerRole: Role; viewerId: string };
const statusOptions = ["Not Started", "In Progress", "Done"] as const;
const typeLabels: Record<CourseActivity["type"], string> = {
  deadline: "Deadline", lab: "Lab session", consultation: "Consultation", milestone: "Milestone",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ActivityWorkspace({ initialActivities, initialError = "", viewerRole, viewerId }: Props) {
  const [activities, setActivities] = useState(initialActivities);
  const [error, setError] = useState(initialError);
  const [savingTask, setSavingTask] = useState<number | null>(null);
  const [busyActivity, setBusyActivity] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ course_id: "", title: "", type: "deadline" as CourseActivity["type"], starts_at: "", location: "" });

  function localDateTime(iso: string) {
    const date = new Date(iso);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function startEditing(activity: CourseActivity) {
    setEditingId(activity.id);
    setEditValues({
      course_id: activity.course_id, title: activity.title, type: activity.type,
      starts_at: localDateTime(activity.starts_at), location: activity.location,
    });
    setError("");
  }

  async function activityRequest(activityId: number, action: "edit" | "delete" | "archive") {
    if (busyActivity !== null) return;
    if (action === "delete" && !window.confirm("Permanently delete this activity and its tasks? Use Archive instead to keep its history.")) return;
    if (action === "archive" && !window.confirm("Archive this activity? It will move from the dashboard into Reports.")) return;
    setBusyActivity(activityId);
    setError("");
    const url = `/api/activities/${activityId}`;
    try {
      const payload = action === "edit" ? {
        ...editValues, starts_at: new Date(editValues.starts_at).toISOString(),
      } : undefined;
      const response = await fetch(action === "archive" ? `${url}/archive` : url, {
        method: action === "edit" ? "PATCH" : action === "delete" ? "DELETE" : "POST",
        ...(payload ? { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) } : {}),
      });
      const body = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? `Could not ${action} activity.`);
      if (action === "edit") {
        setActivities(current => current.map(item => item.id === activityId ? body as CourseActivity : item));
        setEditingId(null);
      } else {
        setActivities(current => current.filter(item => item.id !== activityId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} activity.`);
    } finally {
      setBusyActivity(null);
    }
  }

  async function updateStatus(activityId: number, taskId: number, status: string) {
    setError("");
    setSavingTask(taskId);
    try {
      const response = await fetch(`/api/activities/${activityId}/tasks/${taskId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not update this task.");
      setActivities((current) => current.map((activity) => activity.id !== activityId ? activity : {
        ...activity,
        tasks: activity.tasks.map((task) => task.id === taskId ? body : task),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this task.");
    } finally {
      setSavingTask(null);
    }
  }

  return <div className={styles.workspace}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {activities.length ? <div className={styles.entries}>
      {activities.map((activity) => {
        const tasks = activity.tasks.length ? activity.tasks : [null];
        return tasks.map((task) => {
          const canUpdate = Boolean(task && (viewerRole === "lecturer" || (viewerRole === "ta" && task.assignee_id === viewerId)));
          const flagClass = task?.is_overdue ? styles.entryOverdue : task?.is_at_risk ? styles.entryAtRisk : "";
          const showActivityActions = viewerRole === "lecturer" && task === tasks[0];
          return <article className={`${styles.entry} ${flagClass}`} key={`${activity.id}-${task?.id ?? "schedule"}`}>
            <div className={styles.dateBlock}>
              <strong>{new Date(activity.starts_at).toLocaleDateString("en", { day: "2-digit" })}</strong>
              <span>{new Date(activity.starts_at).toLocaleDateString("en", { month: "short" })}</span>
            </div>
            <div className={styles.entryInfo}>
              <span className={styles.titleRow}>
                <strong>{activity.title}</strong>
                {task?.is_overdue && <span className={`${styles.flag} ${styles.flagOverdue}`}>Overdue</span>}
                {task?.is_at_risk && <span className={`${styles.flag} ${styles.flagAtRisk}`}>At risk</span>}
              </span>
              <span>{typeLabels[activity.type]} · {formatDate(activity.starts_at)} · {activity.location}</span>
              <small>{activity.course_id}{task ? ` · Assigned to ${task.assignee_name}` : " · No task assigned"}</small>
            </div>
            {showActivityActions && <div className={styles.activityActions}>
              <button type="button" disabled={busyActivity !== null} onClick={() => startEditing(activity)}>Edit</button>
              <button type="button" disabled={busyActivity !== null} onClick={() => void activityRequest(activity.id, "archive")}>Archive</button>
              <button type="button" className={styles.danger} disabled={busyActivity !== null} onClick={() => void activityRequest(activity.id, "delete")}>Delete</button>
            </div>}
            {task && <label className={styles.status}>Status
              <select aria-label={`Status for ${activity.title}`} value={task.status} disabled={!canUpdate || savingTask === task.id}
                onChange={(event) => void updateStatus(activity.id, task.id, event.target.value)}>
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>}
            {showActivityActions && editingId === activity.id && <form className={styles.editForm} onSubmit={(event) => { event.preventDefault(); void activityRequest(activity.id, "edit"); }}>
              <label>Course ID<input required maxLength={100} value={editValues.course_id} onChange={e => setEditValues(v => ({ ...v, course_id: e.target.value }))} /></label>
              <label>Title<input required maxLength={200} value={editValues.title} onChange={e => setEditValues(v => ({ ...v, title: e.target.value }))} /></label>
              <label>Type<select value={editValues.type} onChange={e => setEditValues(v => ({ ...v, type: e.target.value as CourseActivity["type"] }))}>
                {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>Date and time<input required type="datetime-local" value={editValues.starts_at} onChange={e => setEditValues(v => ({ ...v, starts_at: e.target.value }))} /></label>
              <label>Location<input required maxLength={200} value={editValues.location} onChange={e => setEditValues(v => ({ ...v, location: e.target.value }))} /></label>
              <div className={styles.editButtons}><button type="submit" disabled={busyActivity !== null}>Save changes</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></div>
            </form>}
          </article>;
        });
      })}
    </div> : error ? null : <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">▦</span>
      <strong>No upcoming activities</strong>
      <span>New course activities will appear here after they are saved.</span>
    </div>}
  </div>;
}
