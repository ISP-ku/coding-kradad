import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ActivityWorkspace from "@/components/ActivityWorkspace";
import { logoutUrl } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard · Course Support" };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const courses = user.classroom_courses ?? [];

  return (
    <AppShell
      page="dashboard"
      title="Dashboard"
      heading="Welcome to your course dashboard"
      subtitle="Stay connected with your learning."
      viewer={user}
      logoutHref={logoutUrl}
    >
      <nav className={styles.pageTabs} aria-label="Dashboard sections">
        <a href="#overview" className={styles.selected}>
          Overview
        </a>
        {(user.provider === "google" || courses.length > 0) && (
          <a href="#courses">My courses</a>
        )}
      </nav>

      <section className={styles.panel} id="overview">
        <div className={styles.panelHeading}>
          <span className={styles.roundIcon}>
            <Icon name="calendar" />
          </span>
          <h2>Activity overview</h2>
        </div>
        <ActivityWorkspace viewerName={user.username} />
      </section>

      {courses.length > 0 ? (
        <section className={`${styles.panel} ${styles.courses}`} id="courses">
          <div className={styles.panelHeading}>
            <span className={styles.roundIcon}>
              <Icon name="book" />
            </span>
            <h2>Your Google Classroom courses</h2>
          </div>
          <div className={styles.panelBody}>
            <ul className={styles.courseList}>
              {courses.map((course) => (
                <li key={course.name}>
                  <Icon name="book" />
                  {course.name}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : user.provider === "google" ? (
        <section className={`${styles.panel} ${styles.courses}`} id="courses">
          <div className={styles.panelHeading}>
            <h2>Your Google Classroom courses</h2>
          </div>
          <div className={styles.emptyState}>
            <Icon name="book" />
            <h3>No active courses found</h3>
            <p>
              Your courses will appear here when they are available from Google
              Classroom.
            </p>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
