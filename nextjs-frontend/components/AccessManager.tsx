"use client";

import { useState } from "react";
import type { Outcome } from "@/lib/request";
import * as api from "@/lib/access-client";
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
  /** A password just created: shown once, here only, until dismissed. */
  const [fresh, setFresh] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const course = courses.find((c) => c.id === courseId) ?? null;
  const codeOf = (id: number) => courses.find((c) => c.id === id)?.code ?? String(id);
  const members = course ? accounts.filter((a) => a.course_ids.includes(course.id)).sort(byEmail) : [];
  const alwaysAllowed = accounts.filter((a) => a.protected);

  const upsert = (account: AccessAccount) =>
    setAccounts((list) => [...list.filter((a) => a.email !== account.email), account].sort(byEmail));

  /** Clears the last message, runs one call, then shows its error or hands its data to `then`. */
  async function run<T>(call: () => Promise<Outcome<T>>, then: (data: T) => void): Promise<void> {
    setError("");
    setNotice("");
    setFresh(null);
    setBusy(true);
    const result = await call();
    setBusy(false);
    if ("error" in result) setError(result.error);
    else then(result.data);
  }

  const changeRole = (account: AccessAccount, next: AccessRole) =>
    run(() => api.changeRole(account.email, next), (updated) => {
      upsert(updated);
      setNotice(`${updated.email} is now a ${ROLE_LABEL[updated.role]}.`);
    });

  async function remove(account: AccessAccount) {
    if (!course) return;
    await run(() => api.removeMember(course.id, account.email), () => {
      const left = account.course_ids.filter((id) => id !== course.id);
      setAccounts((list) =>
        left.length === 0 && !account.protected
          ? list.filter((a) => a.email !== account.email)
          : list.map((a) => (a.email === account.email ? { ...a, course_ids: left } : a)),
      );
      setNotice(`${account.email} was removed from ${course.code}.`);
    });
  }

  async function makePassword(account: AccessAccount) {
    if (account.has_password && !window.confirm(
      `Create a new password for ${account.email}? Their current password will stop working.`)) return;
    await run(() => api.createPassword(account.email), (made) => {
      upsert(made.account);
      setCopied(false);
      setFresh({ email: made.account.email, password: made.password });
    });
  }

  const removePassword = (account: AccessAccount) =>
    run(() => api.removePassword(account.email), (updated) => {
      upsert(updated);
      setNotice(`${updated.email} can no longer sign in with a password.`);
    });

  async function copyPassword() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.password);
      setCopied(true);
    } catch { /* the password stays on screen to copy by hand */ }
  }

  const locked = (a: AccessAccount) => a.protected || a.is_self;
  // Only the server-configured lecturer may create their own password.
  const passwordLocked = (a: AccessAccount) => a.protected && !a.is_self;
  const lockReason = (a: AccessAccount) =>
    a.protected ? "Set in server configuration" : a.is_self ? "You" : "";

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Only people in at least one course can sign in. Removing someone or changing their role
        takes effect on their next click, without waiting for them to sign out. If KU ALL will not
        let someone through, create a password for them and they can sign in with it instead.
      </p>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {fresh && (
        <div className={styles.secret} role="status" aria-label="New password">
          <p>
            Password for <strong>{fresh.email}</strong>. Give it to them now: it is shown only once.
            They sign in with &ldquo;Sign in with a password from your lecturer&rdquo; on the sign-in page.
          </p>
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{fresh.password}</code>
            <button type="button" className={styles.btnGhost} onClick={copyPassword}>{copied ? "Copied" : "Copy"}</button>
            <button type="button" className={styles.btnGhost} onClick={() => setFresh(null)}>Done</button>
          </div>
        </div>
      )}

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
                  <tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Courses</th><th scope="col">Password</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr>
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
                        <div className={styles.passwordCell}>
                          <button
                            type="button"
                            className={styles.small}
                            aria-label={`${a.has_password ? "New password" : "Create password"} for ${a.email}`}
                            disabled={busy || passwordLocked(a)}
                            onClick={() => makePassword(a)}
                          >
                            {a.has_password ? "New password" : "Create password"}
                          </button>
                          {a.has_password && (
                            <button
                              type="button"
                              className={styles.linkish}
                              aria-label={`Remove password for ${a.email}`}
                              disabled={busy || passwordLocked(a)}
                              onClick={() => removePassword(a)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
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
