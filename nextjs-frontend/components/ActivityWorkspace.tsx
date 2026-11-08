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
  // Edit opens its own page, rather than expanding on the dashboard.
  async function activityRequest(activityId: number, action: "delete" | "archive") {
    if (busyActivity !== null) return;
    if (action === "delete" && !window.confirm("Permanently delete this activity and its tasks? Use Archive instead to keep its history.")) return;
    if (action === "archive" && !window.confirm("Archive this activity? It will move from the dashboard into Reports.")) return;
    setBusyActivity(activityId);
    setError("");
    const url = `/api/activities/${activityId}`;
    try {
      const response = await fetch(action === "archive" ? `${url}/archive` : url, {
        method: action === "delete" ? "DELETE" : "POST",
      });
      const body = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? `Could not ${action} activity.`);
      setActivities(current => current.filter(item => item.id !== activityId));
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
      setActivities((current) => current.flatMap((activity) => {
        if (activity.id !== activityId) return [activity];
        const tasks = activity.tasks.map((task) => task.id === taskId ? body : task);
        return tasks.length > 0 && tasks.every(task => task.status === "Done")
          ? []
          : [{ ...activity, tasks }];
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
              <a className={styles.editLink} href={`/dashboard/activities/${activity.id}/edit`}>Edit</a>
              <button type="button" disabled={busyActivity !== null} onClick={() => void activityRequest(activity.id, "archive")}>Archive</button>
              <button type="button" className={styles.danger} disabled={busyActivity !== null} onClick={() => void activityRequest(activity.id, "delete")}>Delete</button>
            </div>}
            {task && <label className={styles.status}>Status
              <select aria-label={`Status for ${activity.title}`} value={task.status} disabled={!canUpdate || savingTask === task.id}
                onChange={(event) => void updateStatus(activity.id, task.id, event.target.value)}>
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>}
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
