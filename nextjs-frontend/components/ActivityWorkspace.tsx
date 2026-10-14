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
          return <article className={styles.entry} key={`${activity.id}-${task?.id ?? "schedule"}`}>
            <div className={styles.dateBlock}>
              <strong>{new Date(activity.starts_at).toLocaleDateString("en", { day: "2-digit" })}</strong>
              <span>{new Date(activity.starts_at).toLocaleDateString("en", { month: "short" })}</span>
            </div>
            <div className={styles.entryInfo}>
              <strong>{activity.title}</strong>
              <span>{typeLabels[activity.type]} · {formatDate(activity.starts_at)} · {activity.location}</span>
              <small>{activity.course_id}{task ? ` · Assigned to ${task.assignee_name}` : " · No task assigned"}</small>
            </div>
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
