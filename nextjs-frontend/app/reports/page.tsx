import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { logoutUrl } from "@/lib/api";
import { canAccess } from "@/lib/permissions";
import { getActivityReport, getReportCourses } from "@/lib/reports";
import { getSessionUser } from "@/lib/session";
import { EmptyState, ReportFilters, ReportSummary, ReportTable } from "./ReportView";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Reports · Course Support" };

type Search = { course_id?: string; start_date?: string; end_date?: string };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** 30 days back to 30 days ahead, so activities completed before their scheduled date still show. */
function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  end.setDate(end.getDate() + 30);
  return { start: isoDate(start), end: isoDate(end) };
}

/** The filters and the report for the chosen course and range (lecturers only). */
async function lecturerReport(searchParams: Search) {
  const courses = await getReportCourses();
  const fallback = defaultRange();
  const courseId = searchParams.course_id ?? courses[0] ?? "";
  const startDate = searchParams.start_date ?? fallback.start;
  const endDate = searchParams.end_date ?? fallback.end;
  const report = courseId ? await getActivityReport(courseId, startDate, endDate) : null;

  return (
    <div className={styles.page}>
      <ReportFilters courses={courses} courseId={courseId} startDate={startDate} endDate={endDate} />
      {!courseId ? (
        <EmptyState title="No course selected">
          No course has any activities yet. Enter a course id above to look one up.
        </EmptyState>
      ) : !report || !report.has_records ? (
        <EmptyState title="No records found">
          No completed or archived activities were recorded for this course in the selected date range.
        </EmptyState>
      ) : (
        <>
          <ReportSummary report={report} />
          <ReportTable activities={report.activities} />
        </>
      )}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");

  return (
    <AppShell
      page="reports"
      title="Reports"
      heading="Activity & support-load history"
      subtitle="Review completed and archived activities for a course and date range."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      {canAccess(viewer, "reports") ? (
        await lecturerReport(searchParams)
      ) : (
        <EmptyState title="Lecturer access required">
          This report is only available to signed-in lecturers (SRS-18, SRS-19).
        </EmptyState>
      )}
    </AppShell>
  );
}
