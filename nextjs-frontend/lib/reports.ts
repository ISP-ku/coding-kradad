import { cookies } from "next/headers";
import { backendJson } from "./backend";
import { PREVIEW, makePreviewReport, previewReportCourses } from "./preview";
import type { ActivityReport } from "./types";

/**
 * GETs a lecturer-only reports endpoint, forwarding the browser's cookies.
 * Null on any failure (not logged in, not a lecturer, backend down, bad
 * params) so the page can fall back to an empty state instead of crashing.
 * A visitor with no session skips the request entirely.
 */
async function fetchReportsApi<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  if (!cookies().get("ku_session")) return null;
  const query = params ? `?${new URLSearchParams(params)}` : "";
  return backendJson<T>(`/api/reports/${path}${query}`);
}

/** Course ids that have activities, for the report's course picker. */
export async function getReportCourses(): Promise<string[]> {
  if (PREVIEW) return previewReportCourses;
  return (await fetchReportsApi<string[]>("courses")) ?? [];
}

/**
 * The completed/archived activity report (SRS-19, SRS-20) for a course
 * and date range.
 */
export async function getActivityReport(
  courseId: string,
  startDate: string,
  endDate: string,
): Promise<ActivityReport | null> {
  if (!courseId) return null;
  if (PREVIEW) return makePreviewReport(courseId);

  return fetchReportsApi<ActivityReport>("activities", {
    course_id: courseId,
    start_date: startDate,
    end_date: endDate,
  });
}
