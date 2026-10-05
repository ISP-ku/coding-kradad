import { cookies } from "next/headers";
import { API_BASE } from "./api";
import { PREVIEW, makePreviewReport, previewReportCourses } from "./preview";
import type { ActivityReport } from "./types";

/**
 * GETs a lecturer-only reports endpoint, forwarding the backend session
 * cookie the same way `getSessionUser` does. Returns null on any failure
 * (not logged in, not a lecturer, backend down, bad params) so the page
 * can fall back to an empty state instead of crashing.
 */
async function fetchReportsApi<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const session = cookies().get("ku_session")?.value;
  if (!session) return null;

  try {
    const url = new URL(`${API_BASE}/api/reports/${path}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

    const res = await fetch(url, {
      headers: { cookie: `ku_session=${session}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
