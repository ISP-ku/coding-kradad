"use client";

import { useState } from "react";
import type { ActivityTask, CourseActivity } from "@/lib/types";
import styles from "./ActivityWorkspace.module.css";

type Role = "student" | "ta" | "lecturer";
type Props = { initialActivities: CourseActivity[]; initialError?: string; viewerRole: Role; viewerId: string };
type GroupKey = "overdue" | "soon" | "later";
type ActivityAction = "delete" | "archive";
type WorkspaceRow = { activity: CourseActivity; task: ActivityTask | null };
type ActivityGroup = { key: GroupKey; label: string; rows: WorkspaceRow[] };

const STATUS_OPTIONS = ["Not Started", "In Progress", "Done"] as const;
const TYPE_LABELS: Record<CourseActivity["type"], string> = {
  deadline: "Deadline",
  lab: "Lab session",
  consultation: "Consultation",
  milestone: "Milestone",
};
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "soon", label: "Next 7 days" },
  { key: "later", label: "Later" },
];
const WEEK = 7 * 24 * 60 * 60 * 1000;

const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "short" });

function formatTime(value: string) {
  return TIME_FORMATTER.format(new Date(value));
}

function formatDay(value: string) {
  return DAY_FORMATTER.format(new Date(value));
}

function formatWeekday(value: string) {
  return WEEKDAY_FORMATTER.format(new Date(value));
}

function formatMonth(value: string) {
  return MONTH_FORMATTER.format(new Date(value));
}

function getGroupKey(row: WorkspaceRow, now: number): GroupKey {
  if (row.task?.is_overdue) return "overdue";
  return new Date(row.activity.starts_at).getTime() <= now + WEEK ? "soon" : "later";
}

function buildRows(activities: CourseActivity[]): WorkspaceRow[] {
  return activities.flatMap((activity): WorkspaceRow[] =>
    activity.tasks.length
      ? activity.tasks.map((task) => ({ activity, task }))
      : [{ activity, task: null }],
  );
}

function buildGroups(rows: WorkspaceRow[], now: number): ActivityGroup[] {
  const sorted = [...rows].sort((a, b) =>
    a.activity.starts_at.localeCompare(b.activity.starts_at),
  );

  return GROUPS
    .map((group) => ({
      ...group,
      rows: sorted.filter((row) => getGroupKey(row, now) === group.key),
    }))
    .filter((group) => group.rows.length > 0);
}

type ActivityRowProps = {
  activity: CourseActivity;
  task: ActivityTask | null;
  viewerRole: Role;
  viewerId: string;
  savingTasks: ReadonlySet<number>;
  busyActivity: number | null;
  onActivityRequest: (activity: CourseActivity, action: ActivityAction) => void;
  onUpdateStatus: (activity: CourseActivity, taskId: number, status: string) => void;
};

function ActivityRow({
  activity,
  task,
  viewerRole,
  viewerId,
  savingTasks,
  busyActivity,
  onActivityRequest,
  onUpdateStatus,
}: ActivityRowProps) {
  const canUpdate = Boolean(
    task &&
      (viewerRole === "lecturer" ||
        (viewerRole === "ta" && task.assignee_id === viewerId)),
  );
  const firstOfActivity = !task || activity.tasks[0]?.id === task.id;

  return (
    <article className={styles.row}>
      <div className={styles.day} aria-label={new Date(activity.starts_at).toLocaleDateString("en-GB")}>
        {formatDay(activity.starts_at)}
        <span>{formatWeekday(activity.starts_at)} {formatMonth(activity.starts_at)}</span>
      </div>

      <div className={styles.info}>
        <h3 className={styles.title}>
          {activity.title}
          {task?.is_at_risk && !task.is_overdue && (
            <span className={styles.flag}>At risk</span>
          )}
        </h3>

        <div className={styles.meta}>
          <span>{TYPE_LABELS[activity.type]}, {formatTime(activity.starts_at)}</span>
          <span>{activity.location}</span>
          <span>{activity.course_id}</span>
          <span>{task ? task.assignee_name : "No TA assigned"}</span>
        </div>

        {viewerRole === "lecturer" && firstOfActivity && (
          <div className={styles.activityActions}>
            <a href={"/dashboard/activities/" + activity.id + "/edit"} aria-label={"Edit " + activity.title}>
              Edit
            </a>
            <button
              type="button"
              aria-label={"Archive " + activity.title}
              disabled={busyActivity !== null}
              onClick={() => onActivityRequest(activity, "archive")}
            >
              Archive
            </button>
            <button
              type="button"
              className={styles.danger}
              aria-label={"Delete " + activity.title}
              disabled={busyActivity !== null}
              onClick={() => onActivityRequest(activity, "delete")}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {task && (
        <select
          className={styles.status}
          aria-label={"Status of " + activity.title}
          value={task.status}
          disabled={!canUpdate || savingTasks.has(task.id)}
          onChange={(event) => onUpdateStatus(activity, task.id, event.target.value)}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      )}
    </article>
  );
}

/**
 * The dashboard activity timeline. TAs can focus on their own tasks or view
 * the full course list; lecturers can edit, archive, delete, and update tasks.
 */
export default function ActivityWorkspace({
  initialActivities,
  initialError = "",
  viewerRole,
  viewerId,
}: Props) {
  const [activities, setActivities] = useState(initialActivities);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [savingTasks, setSavingTasks] = useState<Set<number>>(() => new Set());
  const [busyActivity, setBusyActivity] = useState<number | null>(null);
  const [scope, setScope] = useState<"mine" | "all">(viewerRole === "ta" ? "mine" : "all");

  const allRows = buildRows(activities);
  const mineRows = allRows.filter((row) => row.task?.assignee_id === viewerId);
  const rows = scope === "mine" ? mineRows : allRows;
  const groups = buildGroups(rows, Date.now());

  async function activityRequest(activity: CourseActivity, action: ActivityAction) {
    if (busyActivity !== null) return;

    const message = action === "delete"
      ? "Permanently delete this activity and its tasks? Use Archive instead to keep its history."
      : "Archive this activity? It will move from the dashboard into Reports.";
    if (!window.confirm(message)) return;

    setBusyActivity(activity.id);
    setError("");
    setNotice("");

    try {
      const url = "/api/activities/" + activity.id;
      const response = await fetch(action === "archive" ? url + "/archive" : url, {
        method: action === "delete" ? "DELETE" : "POST",
      });
      const body = response.status === 204
        ? null
        : await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.detail ?? "Could not " + action + " activity.");
      }

      setActivities((current) => current.filter((item) => item.id !== activity.id));
      setNotice((action === "archive" ? "Archived: " : "Deleted: ") + activity.title);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not " + action + " activity.",
      );
    } finally {
      setBusyActivity(null);
    }
  }

  async function updateStatus(activity: CourseActivity, taskId: number, status: string) {
    if (savingTasks.has(taskId)) return;

    setSavingTasks((current) => new Set(current).add(taskId));
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/activities/" + activity.id + "/tasks/" + taskId,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.detail ?? "Could not update this task.");
      }
      if (!body) {
        throw new Error("The server returned an empty response. Please try again.");
      }

      setActivities((current) => current.flatMap((item) => {
        if (item.id !== activity.id) return [item];

        const tasks = item.tasks.map((task) => (task.id === taskId ? body : task));
        return tasks.length > 0 && tasks.every((task) => task.status === "Done")
          ? []
          : [{ ...item, tasks }];
      }));

      setNotice(
        status === "Done"
          ? "Marked done: " + activity.title
          : activity.title + " is now " + status.toLowerCase(),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update this task.",
      );
    } finally {
      setSavingTasks((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }

  return (
    <div className={styles.workspace}>
      {viewerRole === "ta" && (
        <div className={styles.scope} role="group" aria-label="Whose tasks">
          <button
            type="button"
            aria-pressed={scope === "mine"}
            onClick={() => setScope("mine")}
          >
            My tasks ({mineRows.length})
          </button>
          <button
            type="button"
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            Everyone ({allRows.length})
          </button>
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {groups.map((group) => (
        <section
          key={group.key}
          className={styles.group + " " + styles[group.key]}
          aria-labelledby={"group-" + group.key}
        >
          <span className={styles.dot} aria-hidden="true" />
          <h2 id={"group-" + group.key} className={styles.groupLabel}>
            {group.label}
            <span className={styles.groupCount} aria-hidden="true">{group.rows.length}</span>
          </h2>

          {group.rows.map(({ activity, task }) => (
            <ActivityRow
              key={activity.id + "-" + (task?.id ?? "none")}
              activity={activity}
              task={task}
              viewerRole={viewerRole}
              viewerId={viewerId}
              savingTasks={savingTasks}
              busyActivity={busyActivity}
              onActivityRequest={(item, action) => { void activityRequest(item, action); }}
              onUpdateStatus={(item, taskId, status) => { void updateStatus(item, taskId, status); }}
            />
          ))}
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
