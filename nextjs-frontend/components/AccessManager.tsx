"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/homework";
import {
  ROLE_LABEL,
  type AccessAccount, type AccessCourse, type AccessData, type AccessRole,
} from "@/lib/access";
import styles from "./AccessManager.module.css";

const ROLES: AccessRole[] = ["student", "ta", "lecturer"];
const byEmail = (a: AccessAccount, b: AccessAccount) => a.email.localeCompare(b.email);

/**
 * Lecturer page for SRS-23: who is a member of each course, and each
 * account's role. Only members (and LECTURER_EMAILS) can sign in. The role
 * is per account, so changing it here changes it everywhere.
 */
export default function AccessManager({ initial, initialCourseId, initialNotice = "" }: {
  initial: AccessData;
  initialCourseId?: number;
  /** Confirmation carried back from the New course / Add people pages. */
  initialNotice?: string;
}) {
  const courses: AccessCourse[] = initial.courses;
  const [accounts, setAccounts] = useState<AccessAccount[]>(initial.accounts);
  const [courseId, setCourseId] = useState<number | null>(
    initial.courses.some((c) => c.id === initialCourseId) ? initialCourseId! : initial.courses[0]?.id ?? null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);

  const course = courses.find((c) => c.id === courseId) ?? null;
  const codeOf = (id: number) => courses.find((c) => c.id === id)?.code ?? String(id);
  const members = course ? accounts.filter((a) => a.course_ids.includes(course.id)).sort(byEmail) : [];
  const alwaysAllowed = accounts.filter((a) => a.protected);

  const upsert = (account: AccessAccount) =>
    setAccounts((list) => [...list.filter((a) => a.email !== account.email), account].sort(byEmail));

  /** Runs one request; returns the parsed body, or null after showing the error. */
  async function send<T>(url: string, init: RequestInit, fallback: string): Promise<T | null | undefined> {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await fetch(url, {
        ...init,
        headers: init.body ? { "Content-Type": "application/json" } : undefined,
      });
      if (!res.ok) {
        setError(await errorMessage(res, fallback));
        return null;
      }
      return res.status === 204 ? undefined : ((await res.json()) as T);
    } catch {
      setError("Could not reach the server. Please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(account: AccessAccount, next: AccessRole) {
    const updated = await send<AccessAccount>(
      `/api/access/accounts/${encodeURIComponent(account.email)}`,
      { method: "PATCH", body: JSON.stringify({ role: next }) },
      "Could not change the role.",
    );
    if (!updated) return;
    upsert(updated);
    setNotice(`${updated.email} is now a ${ROLE_LABEL[updated.role]}.`);
  }

  async function remove(account: AccessAccount) {
    if (!course) return;
    const done = await send<never>(
      `/api/access/courses/${course.id}/members/${encodeURIComponent(account.email)}`,
      { method: "DELETE" },
      "Could not remove this account.",
    );
    if (done === null) return;
    const left = account.course_ids.filter((id) => id !== course.id);
    setAccounts((list) =>
      left.length === 0 && !account.protected
        ? list.filter((a) => a.email !== account.email)
        : list.map((a) => (a.email === account.email ? { ...a, course_ids: left } : a)),
    );
    setNotice(`${account.email} was removed from ${course.code}.`);
  }

  const locked = (a: AccessAccount) => a.protected || a.is_self;
  const lockReason = (a: AccessAccount) =>
    a.protected ? "Set in server configuration" : a.is_self ? "You" : "";

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Only people in at least one course can sign in. Removing someone or changing their role
        takes effect on their next click, without waiting for them to sign out.
      </p>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <section className={styles.panel} aria-label="Courses">
        <div className={styles.courseBar}>
          {courses.length > 0 ? (
            <label className={styles.field}>
              <span>Course</span>
              <select value={courseId ?? ""} onChange={(e) => setCourseId(Number(e.target.value))}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}{c.name && c.name !== c.code ? ` — ${c.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className={styles.empty}>There are no courses yet. Use New course to create one, then Add people.</p>
          )}
        </div>
      </section>

      {course && (
        <section className={styles.panel} aria-label={`Manage ${course.code}`}>
          {members.length === 0 ? (
            <p className={styles.empty}>No one is in this course yet. Use Add people to add them.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label={`Members of ${course.code}`}>
                <thead>
                  <tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Courses</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr>
                </thead>
                <tbody>
                  {members.map((a) => (
                    <tr key={a.email}>
                      <td className={styles.email}>
                        {a.email}
                        {lockReason(a) && <span className={styles.chip}>{lockReason(a)}</span>}
                      </td>
                      <td>
                        <select
                          aria-label={`Role for ${a.email}`}
                          value={a.role}
                          disabled={busy || locked(a)}
                          onChange={(e) => changeRole(a, e.target.value as AccessRole)}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      </td>
                      <td>{a.course_ids.map(codeOf).join(", ")}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={`Remove ${a.email} from ${course.code}`}
                          disabled={busy || locked(a)}
                          onClick={() => remove(a)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {alwaysAllowed.length > 0 && (
        <p className={styles.hint}>
          Always allowed as lecturers (server configuration, LECTURER_EMAILS):{" "}
          {alwaysAllowed.map((a) => a.email).join(", ")}
        </p>
      )}
    </div>
  );
}
