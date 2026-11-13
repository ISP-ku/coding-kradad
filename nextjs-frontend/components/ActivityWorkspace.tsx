"use client";

import { useState } from "react";
import type { ActivityTask, CourseActivity } from "@/lib/types";
import styles from "./ActivityWorkspace.module.css";

type Role = "student" | "ta" | "lecturer";
type Props = { initialActivities: CourseActivity[]; initialError?: string; viewerRole: Role; viewerId: string };
type GroupKey = "overdue" | "soon" | "later";
type Row = { activity: CourseActivity; task: ActivityTask | null };

const statusOptions = ["Not Started", "In Progress", "Done"] as const;
const typeLabels: Record<CourseActivity["type"], string> = {
  deadline: "Deadline", lab: "Lab session", consultation: "Consultation", milestone: "Milestone",
};
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "soon", label: "Next 7 days" },
  { key: "later", label: "Later" },
];
const WEEK = 7 * 24 * 60 * 60 * 1000;

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayNum = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(new Date(iso));
const weekday = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(iso));
const month = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(iso));

/** Which group a row belongs to: the backend's Overdue flag (SRS-12) wins, then the date. */
function groupOf({ activity, task }: Row, now: number): GroupKey {
  if (task?.is_overdue) return "overdue";
  return new Date(activity.starts_at).getTime() <= now + WEEK ? "soon" : "later";
}

/**
 * The "what needs me now" list on the Today page: every activity task,
 * grouped by urgency along a time line (SRS-4, SRS-10 to SRS-13). A TA sees
 * their own tasks first; a lecturer sees everyone's, plus edit/archive/delete.
 */
export default function ActivityWorkspace({ initialActivities, initialError = "", viewerRole, viewerId }: Props) {
  const [activities, setActivities] = useState(initialActivities);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [savingTask, setSavingTask] = useState<number | null>(null);
  const [busyActivity, setBusyActivity] = useState<number | null>(null);
  const [scope, setScope] = useState<"mine" | "all">(viewerRole === "ta" ? "mine" : "all");

  const allRows: Row[] = activities.flatMap((activity): Row[] =>
    activity.tasks.length ? activity.tasks.map((task) => ({ activity, task })) : [{ activity, task: null }],
  );
  const mineRows = allRows.filter((r) => r.task?.assignee_id === viewerId);
  const rows = scope === "mine" ? mineRows : allRows;
  const now = Date.now();
  const sorted = [...rows].sort((a, b) => a.activity.starts_at.localeCompare(b.activity.starts_at));
  const groups = GROUPS.map((g) => ({ ...g, rows: sorted.filter((r) => groupOf(r, now) === g.key) })).filter((g) => g.rows.length);

  async function activityRequest(activity: CourseActivity, action: "delete" | "archive") {
    if (busyActivity !== null) return;
    if (action === "delete" && !window.confirm("Permanently delete this activity and its tasks? Use Archive instead to keep its history.")) return;
    if (action === "archive" && !window.confirm("Archive this activity? It will move from Today into Reports.")) return;
    setBusyActivity(activity.id);
    setError("");
    setNotice("");
    const url = `/api/activities/${activity.id}`;
    try {
      const response = await fetch(action === "archive" ? `${url}/archive` : url, {
        method: action === "delete" ? "DELETE" : "POST",
      });
      const body = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? `Could not ${action} activity.`);
      setActivities((current) => current.filter((item) => item.id !== activity.id));
      setNotice(action === "archive" ? `Archived: ${activity.title}` : `Deleted: ${activity.title}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} activity.`);
    } finally {
      setBusyActivity(null);
    }
  }

  async function updateStatus(activity: CourseActivity, taskId: number, status: string) {
    setError("");
    setNotice("");
    setSavingTask(taskId);
    try {
      const response = await fetch(`/api/activities/${activity.id}/tasks/${taskId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not update this task.");
      setActivities((current) => current.flatMap((item) => {
        if (item.id !== activity.id) return [item];
        const tasks = item.tasks.map((task) => (task.id === taskId ? body : task));
        // A fully done activity leaves Today and shows in Reports (SRS-4).
        return tasks.length > 0 && tasks.every((task) => task.status === "Done") ? [] : [{ ...item, tasks }];
      }));
      setNotice(status === "Done" ? `Marked done: ${activity.title}` : `${activity.title} is now ${status.toLowerCase()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this task.");
    } finally {
      setSavingTask(null);
    }
  }

  return (
    <div className={styles.workspace}>
      {viewerRole === "ta" && (
        <div className={styles.scope} role="group" aria-label="Whose tasks">
          <button type="button" aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>My tasks ({mineRows.length})</button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>Everyone ({allRows.length})</button>
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {groups.map((g) => (
        <section key={g.key} className={`${styles.group} ${styles[g.key]}`} aria-labelledby={`group-${g.key}`}>
          <span className={styles.dot} aria-hidden="true" />
          <h2 id={`group-${g.key}`} className={styles.groupLabel}>{g.label}</h2>
          {g.rows.map(({ activity, task }) => {
            const canUpdate = Boolean(task && (viewerRole === "lecturer" || (viewerRole === "ta" && task.assignee_id === viewerId)));
            const firstOfActivity = !task || activity.tasks[0]?.id === task.id;
            return (
              <article className={styles.row} key={`${activity.id}-${task?.id ?? "none"}`}>
                <div className={styles.day}>
                  {dayNum(activity.starts_at)}
                  <span>{weekday(activity.starts_at)} {month(activity.starts_at)}</span>
                </div>
                <div className={styles.info}>
                  <h3 className={styles.title}>
                    {activity.title}
                    {task?.is_at_risk && !task.is_overdue && <span className={styles.flag}>At risk</span>}
                  </h3>
                  <div className={styles.meta}>
                    <span>{typeLabels[activity.type]}, {time(activity.starts_at)}</span>
                    <span>{activity.location}</span>
                    <span>{activity.course_id}</span>
                    {task ? <span>{task.assignee_name}</span> : <span>No TA assigned</span>}
                  </div>
                  {viewerRole === "lecturer" && firstOfActivity && (
                    <div className={styles.activityActions}>
                      <a href={`/dashboard/activities/${activity.id}/edit`} aria-label={`Edit ${activity.title}`}>Edit</a>
                      <button type="button" aria-label={`Archive ${activity.title}`} disabled={busyActivity !== null}
                        onClick={() => void activityRequest(activity, "archive")}>Archive</button>
                      <button type="button" className={styles.danger} aria-label={`Delete ${activity.title}`} disabled={busyActivity !== null}
                        onClick={() => void activityRequest(activity, "delete")}>Delete</button>
                    </div>
                  )}
                </div>
                {task && (
                  <select
                    className={styles.status}
                    aria-label={`Status of ${activity.title}`}
                    value={task.status}
                    disabled={!canUpdate || savingTask === task.id}
                    onChange={(event) => void updateStatus(activity, task.id, event.target.value)}
                  >
                    {statusOptions.map((status) => <option key={status}>{status}</option>)}
                  </select>
                )}
              </article>
            );
          })}
        </section>
      ))}

      {!groups.length && !error && (
        <p className={styles.empty}>
          {scope === "mine" && allRows.length
            ? "Nothing is due for you. Switch to Everyone to see the rest of the course."
            : "Nothing is due. New activities appear here as soon as a lecturer adds them."}
        </p>
      )}
    </div>
  );
}
