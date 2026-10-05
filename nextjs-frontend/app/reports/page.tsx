import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { logoutUrl } from "@/lib/api";
import { getActivityReport, getReportCourses } from "@/lib/reports";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Reports · Course Support" };

const statusClass: Record<string, string> = {
  Done: styles.statusDone,
  "In Progress": styles.statusInProgress,
  "Not Started": styles.statusNotStarted,
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: isoDate(start), end: isoDate(end) };
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { course_id?: string; start_date?: string; end_date?: string };
}) {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");

  if (viewer.role !== "lecturer") {
    return (
      <AppShell
        page="reports"
        title="Reports"
        heading="Activity & support-load history"
        subtitle="Review completed and archived activities for a course and date range."
        viewer={viewer}
        logoutHref={logoutUrl}
      >
        <div className={styles.emptyState}>
          <Icon name="calendar" />
          <h3>Lecturer access required</h3>
          <p>This report is only available to signed-in lecturers (SRS-18, SRS-19).</p>
        </div>
      </AppShell>
    );
  }

  const courses = await getReportCourses();
  const fallback = defaultRange();

  const courseId = searchParams.course_id ?? courses[0] ?? "";
  const startDate = searchParams.start_date ?? fallback.start;
  const endDate = searchParams.end_date ?? fallback.end;

  const report = courseId ? await getActivityReport(courseId, startDate, endDate) : null;

  return (
    <AppShell
      page="reports"
      title="Reports"
      heading="Activity & support-load history"
      subtitle="Review completed and archived activities for a course and date range."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={styles.page}>
        <form className={styles.filterForm} method="get" action="/reports">
          <div className={styles.field}>
            <label htmlFor="course_id">Course</label>
            {courses.length > 0 ? (
              <select id="course_id" name="course_id" defaultValue={courseId}>
                {courses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
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
          <button type="submit" className={styles.btn}>
            View report
          </button>
        </form>

        {!courseId ? (
          <div className={styles.emptyState}>
            <Icon name="calendar" />
            <h3>No course selected</h3>
            <p>No course has any activities yet. Enter a course id above to look one up.</p>
          </div>
        ) : !report || !report.has_records ? (
          <div className={styles.emptyState}>
            <Icon name="calendar" />
            <h3>No records found</h3>
            <p>No completed or archived activities were recorded for this course in the selected date range.</p>
          </div>
        ) : (
          <>
            <div className={styles.summary}>
              <span className={styles.summaryPill}>
                {report.activity_count} activit{report.activity_count === 1 ? "y" : "ies"}
              </span>
              {Object.entries(report.status_summary).map(([status, count]) => (
                <span className={styles.summaryPill} key={status}>
                  {count} {status}
                </span>
              ))}
              {report.consultations.count > 0 && (
                <span className={styles.summaryPill}>
                  {report.consultations.count} consultation
                  {report.consultations.count === 1 ? "" : "s"} ·{" "}
                  {report.consultations.total_minutes} min support load (all courses)
                </span>
              )}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {report.activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>
                        {activity.title}
                        {activity.archived_at && <span className={styles.muted}> · archived</span>}
                      </td>
                      <td>{activity.type}</td>
                      <td>{formatDateTime(activity.starts_at)}</td>
                      <td>{activity.location}</td>
                      <td>
                        {activity.tasks.length === 0 ? (
                          <span className={styles.muted}>Unassigned</span>
                        ) : (
                          activity.tasks.map((task) => (
                            <span
                              className={`${styles.taskChip} ${statusClass[task.status] ?? ""}`}
                              key={task.id}
                            >
                              {task.status}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
