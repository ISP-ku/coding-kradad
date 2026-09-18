import Link from "next/link";
import type { Homework, HomeworkStatus } from "@/lib/types";
import styles from "./page.module.css";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

const statusClass: Record<HomeworkStatus, string> = {
  submitted: styles.statusSubmitted,
  missing: styles.statusMissing,
  late: styles.statusLate,
};

async function getHomeworks(): Promise<Homework[]> {
  const res = await fetch(`${API_BASE}/api/homework`, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as Homework[];
}

async function getAssignmentOptions(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/homework/assignments`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as string[];
}

export default async function HomeworkPage() {
  const [homeworks, assignmentOptions] = await Promise.all([
    getHomeworks(),
    getAssignmentOptions(),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/">&larr; Back</Link>
        <strong>Homework Collector</strong>
      </div>

      <div className={styles.scopeNote}>
        Note: this page is a UI concept only — homework/assignment collection
        is not part of the current SRS scope (which covers activity tracking
        and support logging). Treat this as a proposal, not delivered scope,
        until it&apos;s formally added to a future iteration.
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Student</th>
            <th>Assignment</th>
            <th>Due Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {homeworks.length > 0 ? (
            homeworks.map((hw, i) => (
              <tr key={i}>
                <td>{hw.student}</td>
                <td>{hw.assignment}</td>
                <td>{hw.due_date}</td>
                <td>
                  <span
                    className={`${styles.status} ${statusClass[hw.status]}`}
                  >
                    {hw.status}
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>No submissions yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className={styles.uploadPanel}>
        <h3>Submit homework</h3>
        <form
          method="post"
          action={`${API_BASE}/homework/submit`}
          encType="multipart/form-data"
        >
          <label>Assignment</label>
          <select name="assignment">
            {assignmentOptions.map((a) => (
              <option value={a} key={a}>
                {a}
              </option>
            ))}
          </select>

          <label>File</label>
          <input type="file" name="file" />

          <button type="submit">Submit</button>
        </form>
      </div>
    </main>
  );
}
