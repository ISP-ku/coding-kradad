import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { API_BASE, authOptions, loginUrl, logoutUrl } from "@/lib/api";
import { homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sign in · Course Support" };

/** A small, static picture of the home page, so people see what they are signing in to. */
function HomePreview() {
  const rows = [
    { group: "Overdue", tone: styles.over, day: "11", title: "Lab 3 room setup", where: "01219245, room E204", state: "In progress" },
    { group: "Next 7 days", tone: styles.soon, day: "16", title: "Quiz 2 consultation slot", where: "01219245, online", state: "Not started" },
  ];
  return (
    <div className={styles.preview} aria-hidden="true">
      <div className={styles.previewHead}>
        <strong>Good afternoon, Nida</strong>
        <span>Friday 13 November</span>
      </div>
      {rows.map((r) => (
        <div key={r.title}>
          <p className={`${styles.previewGroup} ${r.tone}`}>{r.group}</p>
          <div className={styles.previewRow}>
            <span className={`${styles.previewDay} ${r.tone}`}>{r.day}</span>
            <span className={styles.previewText}>
              <span>{r.title}</span>
              <small>{r.where}</small>
            </span>
            <span className={styles.previewPill}>{r.state}</span>
          </div>
        </div>
      ))}
      <div className={styles.previewRow}>
        <span className={styles.previewDay}>7</span>
        <span className={styles.previewText}>
          <span>Homework 3 is waiting for grading</span>
          <small>7 submissions</small>
        </span>
        <span className={`${styles.previewPill} ${styles.previewPrimary}`}>Grade</span>
      </div>
    </div>
  );
}

export default async function LoginPage() {
  const user = await getSessionUser();
  const options = await authOptions();

  return (
    <div className={styles.layout}>
      <main className={styles.signIn}>
        <div className={styles.top}>
          <span className={styles.brand}>
            <svg className={styles.logo} viewBox="0 0 30 30" aria-hidden="true">
              <rect width="30" height="30" rx="8" />
              <path d="M9 10.5h12M9 15h8M9 19.5h10" />
            </svg>
            Course Support
          </span>
          <ThemeToggle />
        </div>

        <div className={styles.card}>
          {user ? (
            <>
              {user.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.avatar} src={user.avatar_url} alt="Your profile photo" referrerPolicy="no-referrer" />
              )}
              <h1>Welcome back, {user.username}</h1>
              <p className={styles.lead}>
                You are signed in with {user.provider === "local" ? "a local test account" : user.provider === "email" ? "an email code" : "your Google account"}.
              </p>
              <Link className={styles.primary} href={homePathFor(user)}>Open my course</Link>
              <a className={styles.secondary} href={logoutUrl}>Log out and use another account</a>
            </>
          ) : (
            <>
              <h1>Sign in to your course</h1>
              <p className={styles.lead}>See what is due, what is overdue and what is waiting for you, in one list.</p>
              <a className={styles.primary} href={loginUrl("google")}>
                <svg className={styles.g} viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="10" cy="10" r="10" fill="#fff" />
                  <path d="M14.6 10.2c0-.4 0-.7-.1-1H10v1.9h2.6a2.3 2.3 0 0 1-1 1.5v1.2h1.6c1-.9 1.4-2.1 1.4-3.6Z" fill="#4285F4" />
                  <path d="M10 15c1.3 0 2.4-.4 3.2-1.2l-1.6-1.2c-.4.3-1 .5-1.6.5a2.8 2.8 0 0 1-2.6-1.9H5.7v1.3A5 5 0 0 0 10 15Z" fill="#34A853" />
                  <path d="M7.4 11.2a3 3 0 0 1 0-1.9V8H5.7a5 5 0 0 0 0 4.5l1.7-1.3Z" fill="#FBBC05" />
                  <path d="M10 7c.7 0 1.4.3 1.9.7l1.4-1.4A5 5 0 0 0 5.7 8l1.7 1.3C7.8 8 8.8 7 10 7Z" fill="#EA4335" />
                </svg>
                Continue with KU Google
              </a>
              {(options.email_code || options.personal_google) && <p className={styles.or}>Can&apos;t get through KU ALL?</p>}
              {options.email_code && <a className={styles.quiet} href="/sign-in/email">Email me a sign-in code</a>}
              {options.personal_google && (
                <a className={styles.quiet} href={loginUrl("google-personal")}>Continue with a personal Google account</a>
              )}
              {options.local_test_login && (
                <a className={styles.quiet} href={`${API_BASE}/local-test-login`}>Use a local test account</a>
              )}
              <p className={styles.help}>
                Use your account ending in @ku.th{options.personal_google ? ", or the Gmail address your lecturer added" : ""}.
                If you are new to the course and cannot get in, ask your lecturer to add you.
              </p>
            </>
          )}
        </div>

        <p className={styles.footer}>Kasetsart University course support and activity dashboard</p>
      </main>

      <aside className={styles.side} aria-label="What you will see after signing in">
        <div className={styles.sideInner}>
          <p className={styles.sideText}>After you sign in, the work that needs you comes first, sorted by how soon it is due.</p>
          <HomePreview />
        </div>
      </aside>
    </div>
  );
}
