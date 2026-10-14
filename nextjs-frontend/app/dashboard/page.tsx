import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ActivityWorkspace from "@/components/ActivityWorkspace";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { CourseActivity } from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard · Course Support" };

async function loadActivities(): Promise<{ activities: CourseActivity[]; error: string }> {
  const cookieHeader = cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  try {
    const response = await fetch(`${API_BASE}/api/activities`, { headers: { cookie: cookieHeader }, cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { activities: [], error: body.detail ?? "Could not load course activities." };
    }
    return { activities: (await response.json()) as CourseActivity[], error: "" };
  } catch {
    return { activities: [], error: "Activity service is unavailable. Start the backend and refresh this page." };
  }
}

export default async function DashboardPage() {
  if (PREVIEW) redirect("/");
  const user = await getSessionUser();
  if (!user) redirect("/");

  const [activityResult, courses] = await Promise.all([loadActivities(), Promise.resolve(user.classroom_courses ?? [])]);
  const userIdentity = `${user.provider}:${user.id}`;

  return (
    <AppShell
      page="dashboard"
      title="Dashboard"
      heading="Welcome to your course dashboard"
      subtitle="Stay connected with your course activities."
      viewer={user}
      logoutHref={logoutUrl}
    >
      <div className={styles.dashboardActions}>
        <div>
          <span className={styles.eyebrow}>YOUR COURSE WORKSPACE</span>
          <h2>Upcoming activities</h2>
        </div>
        {user.role === "lecturer" && (
          <a className={styles.addButton} href="/dashboard/activities/new">
            <Icon name="plus" /> Add activity
          </a>
        )}
      </div>
      <section className={styles.panel} aria-label="Upcoming course activities">
        <ActivityWorkspace
          initialActivities={activityResult.activities}
          initialError={activityResult.error}
          viewerRole={user.role ?? "student"}
          viewerId={userIdentity}
        />
      </section>

      {courses.length > 0 ? (
        <section className={`${styles.panel} ${styles.courses}`} id="courses">
          <div className={styles.panelHeading}>
            <span className={styles.roundIcon}><Icon name="book" /></span>
            <h2>Your Google Classroom courses</h2>
          </div>
          <div className={styles.panelBody}>
            <ul className={styles.courseList}>
              {courses.map((course) => <li key={course.name}><Icon name="book" />{course.name}</li>)}
            </ul>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
