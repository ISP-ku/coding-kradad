import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        {user.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar_url} alt="avatar" />
        )}
        <div>
          <strong>{user.username}</strong>
          <br />
          <small>
            {user.provider[0].toUpperCase() + user.provider.slice(1)} ID:{" "}
            {user.id}
          </small>
          {user.email && (
            <>
              <br />
              <small>{user.email}</small>
            </>
          )}
        </div>
        <a className={styles.logout} href={`${API_BASE}/logout`}>
          Log out
        </a>
      </div>

      <div className={styles.note}>
        This is a placeholder dashboard. This is where your combined activity
        dashboard (deadlines, tasks, consultations) would render once the
        authenticated user is linked to a Users &amp; Roles record in your
        database.
      </div>

      {user.classroom_courses && user.classroom_courses.length > 0 ? (
        <div className={styles.courses}>
          <strong>Your Google Classroom courses</strong>
          <ul>
            {user.classroom_courses.map((course) => (
              <li key={course.name}>{course.name}</li>
            ))}
          </ul>
        </div>
      ) : user.provider === "google" ? (
        <div className={styles.courses}>
          <strong>Your Google Classroom courses</strong>
          <p>
            No active courses found (or the Classroom API isn&apos;t enabled
            yet for this app - see README.md).
          </p>
        </div>
      ) : null}

      {/* Flask gated these behind has_faq / has_homework flags from the
          request context; here they're just always-on routes in the app. */}
      <div className={styles.links}>
        <Link href="/faq" className={styles.linkBtn}>
          FAQ / Issue Log
        </Link>
        <Link href="/homework" className={styles.linkBtn}>
          Homework Collector
        </Link>
      </div>
    </main>
  );
}
