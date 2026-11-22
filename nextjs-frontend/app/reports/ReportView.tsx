import Icon from "@/components/Icon";
import { formatDateTime } from "@/lib/dates";
import type { ActivityReport, ReportActivity } from "@/lib/types";
import styles from "./page.module.css";

const statusClass: Record<string, string> = {
  Done: styles.statusDone,
  "In Progress": styles.statusInProgress,
  "Not Started": styles.statusNotStarted,
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why an activity is history: archived, or every task Done. Nothing when it simply already happened. */
function historyNote(activity: ReportActivity): string | null {
  if (activity.archived_at) return "(archived)";
  if (activity.tasks.length > 0 && activity.tasks.every((task) => task.status === "Done")) return "(completed)";
  return null;
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.emptyState}>
      <Icon name="calendar" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/** Course and date range picker. A plain GET form, so the choice lives in the address. */
export function ReportFilters({ courses, courseId, startDate, endDate }: {
  courses: string[]; courseId: string; startDate: string; endDate: string;
}) {
  return (
    <form className={styles.filterForm} method="get" action="/reports">
      <div className={styles.field}>
        <label htmlFor="course_id">Course</label>
        {courses.length > 0 ? (
          <select id="course_id" name="course_id" defaultValue={courseId}>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input id="course_id" name="course_id" defaultValue={courseId} placeholder="Course id" />
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor="start_date">From</label>
        <input type="date" id="start_date" name="start_date" defaultValue={startDate} />
      </div>
      <div className={styles.field}>
        <label htmlFor="end_date">To</label>
        <input type="date" id="end_date" name="end_date" defaultValue={endDate} />
      </div>
      <button type="submit" className={styles.btn}>View report</button>
    </form>
  );
}

/** Counts across the report: activities, tasks per status, and the support load. */
export function ReportSummary({ report }: { report: ActivityReport }) {
  const { consultations } = report;
  return (
    <div className={styles.summary}>
      <span className={styles.summaryPill}>{plural(report.activity_count, "activity", "activities")}</span>
      {Object.entries(report.status_summary).map(([status, count]) => (
        <span className={styles.summaryPill} key={status}>{count} {status}</span>
      ))}
      {consultations.count > 0 && (
        <span className={styles.summaryPill}>
          {plural(consultations.count, "consultation", "consultations")} · {consultations.total_minutes} min support load (all courses)
        </span>
      )}
    </div>
  );
}

/** One row per completed or archived activity, with each task's status. */
export function ReportTable({ activities }: { activities: ReportActivity[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr><th>Title</th><th>Type</th><th>Date</th><th>Location</th><th>Tasks</th></tr>
        </thead>
        <tbody>
          {activities.map((activity) => {
            const note = historyNote(activity);
            return (
              <tr key={activity.id}>
                <td>
                  {activity.title}
                  {note && <span className={styles.muted}> {note}</span>}
                </td>
                <td>{activity.type}</td>
                <td>{formatDateTime(activity.starts_at)}</td>
                <td>{activity.location}</td>
                <td>
                  {activity.tasks.length === 0 ? (
                    <span className={styles.muted}>Unassigned</span>
                  ) : (
                    activity.tasks.map((task) => (
                      <span className={`${styles.taskChip} ${statusClass[task.status] ?? ""}`} key={task.id}>
                        {task.status}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
