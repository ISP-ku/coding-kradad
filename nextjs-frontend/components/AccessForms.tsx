"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/homework";
import { ROLE_LABEL, normaliseKuEmail, type AccessCourse, type AccessRole } from "@/lib/access";
import styles from "./AccessManager.module.css";

const ROLES: AccessRole[] = ["student", "ta", "lecturer"];

async function post<T>(url: string, body: unknown, fallback: string): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return { error: await errorMessage(res, fallback) };
    return { data: (await res.json()) as T };
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }
}

/** Add a KU account to a course with a role (SRS-23). Its own page: /access/members/new. */
export function AccessMemberForm({ courses, defaultCourseId, onDone }: {
  courses: AccessCourse[];
  defaultCourseId?: number;
  /** Called with the course and email after adding; without it the page returns to Access. */
  onDone?: (courseId: number, email: string) => void;
}) {
  const [courseId, setCourseId] = useState<number>(defaultCourseId ?? courses[0]?.id ?? 0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessRole>("student");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = normaliseKuEmail(email);
    setEmailError(clean ? "" : "Enter a KU email address ending in @ku.th.");
    if (!clean) return;
    setBusy(true);
    const { error: failed } = await post(`/api/access/courses/${courseId}/members`, { email: clean, role }, "Could not add this account.");
    setBusy(false);
    if (failed) {
      setError(failed);
      return;
    }
    if (onDone) onDone(courseId, clean);
    else window.location.assign(`/access?course=${courseId}&added=${encodeURIComponent(clean)}`);
  }

  return (
    <form className={styles.panel} onSubmit={submit} noValidate aria-label="Add people">
      <div className={styles.stack}>
        <label className={styles.field}>
          <span>Course</span>
          <select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code}{c.name && c.name !== c.code ? `, ${c.name}` : ""}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>KU email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name.s@ku.th"
            aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? "member-email-error" : undefined} />
          {emailError && <span className={styles.fieldError} id="member-email-error">{emailError}</span>}
        </label>
        <label className={styles.field}>
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as AccessRole)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <p className={styles.hint}>The role applies to every course this person is in. They can sign in as soon as you add them.</p>
        {error && <p className={styles.alert} role="alert">{error}</p>}
        <div><button className={styles.btn} type="submit" disabled={busy}>Add to course</button></div>
      </div>
    </form>
  );
}

/** Create a course on the dashboard (SRS-23). Its own page: /access/courses/new. */
export function AccessCourseForm({ onDone }: { onDone?: (courseId: number) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [codeError, setCodeError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCodeError(code.trim() ? "" : "Enter a course code.");
    if (!code.trim()) return;
    setBusy(true);
    const { data, error: failed } = await post<AccessCourse>("/api/access/courses",
      { code: code.trim(), name: name.trim() || null }, "Could not create the course.");
    setBusy(false);
    if (failed || !data) {
      setError(failed ?? "Could not create the course.");
      return;
    }
    if (onDone) onDone(data.id);
    else window.location.assign(`/access?course=${data.id}&created=1`);
  }

  return (
    <form className={styles.panel} onSubmit={submit} noValidate aria-label="New course">
      <div className={styles.stack}>
        <label className={styles.field}>
          <span>Course code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={50} placeholder="01219245"
            aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? "course-code-error" : undefined} />
          {codeError && <span className={styles.fieldError} id="course-code-error">{codeError}</span>}
        </label>
        <label className={styles.field}>
          <span>Course name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Software Process" />
        </label>
        {error && <p className={styles.alert} role="alert">{error}</p>}
        <div><button className={styles.btn} type="submit" disabled={busy}>Create course</button></div>
      </div>
    </form>
  );
}
