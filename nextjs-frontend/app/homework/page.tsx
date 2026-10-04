import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW, previewAssignments, previewHomeworks } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { Homework } from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Homework Collector · Course Support" };

const statusClass: Record<string, string> = {
  submitted: styles.statusSubmitted,
  missing: styles.statusMissing,
  late: styles.statusLate,
};

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export default async function HomeworkPage() {
  const [viewer, homeworks, assignmentOptions] = await Promise.all([
    getSessionUser(),
    PREVIEW ? previewHomeworks : getJson<Homework[]>("/api/homework", []),
    PREVIEW ? previewAssignments : getJson<string[]>("/api/homework/assignments", []),
  ]);

  return (
    <AppShell
      page="homework"
      title="Homework Collector"
      heading="Your homework overview"
      subtitle="Keep track of assignments and submissions."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={styles.page}>
        <div className={styles.scopeNote}>
          Preview feature · Homework collection is a UI concept for a future iteration.
        </div>

        <div className={styles.tableWrap}>
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
                        className={`${styles.status} ${statusClass[hw.status.toLowerCase()] ?? ""}`}
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
        </div>

        <div className={styles.uploadPanel}>
          <h3>Submit homework</h3>
          <form
            method="post"
            action={`${API_BASE}/homework/submit`}
            encType="multipart/form-data"
          >
            <label htmlFor="assignment">Assignment</label>
            <select id="assignment" name="assignment">
              {assignmentOptions.map((a) => (
                <option value={a} key={a}>
                  {a}
                </option>
              ))}
            </select>

            <label htmlFor="file">File</label>
            <input type="file" id="file" name="file" />

            <button type="submit" className={styles.btn}>
              Submit
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
