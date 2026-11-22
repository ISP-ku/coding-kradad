"use client";

import { useState } from "react";
import { addMember, createCourse } from "@/lib/access-client";
import { normaliseMemberEmail, type AccessCourse, type AccessRole } from "@/lib/access";
import { ChoiceGroup, Field, FieldRow, FormActions, FormCard, FormMessage, FormNote, fieldAria, type Choice } from "./form/FormKit";

const ROLES: Choice<AccessRole>[] = [
  { value: "student", label: "Student", hint: "Sees homework and the FAQ" },
  { value: "ta", label: "Teaching assistant", hint: "Gets tasks, grades and logs consultations" },
  { value: "lecturer", label: "Lecturer", hint: "Manages activities, homework and access" },
];

/**
 * Add someone to a course with a role (SRS-23). Its own page: /access/members/new.
 * Any email works; without @ku.th the person can only sign in with a password
 * the lecturer creates on the Access page.
 */
export function AccessMemberForm({ courses, defaultCourseId, onDone }: {
  courses: AccessCourse[];
  defaultCourseId?: number;
  /** Called with the course and email after adding; without it the page returns to Access. */
  onDone?: (courseId: number, email: string) => void;
}) {
  const [courseId, setCourseId] = useState<number>(
    courses.some((c) => c.id === defaultCourseId) ? defaultCourseId! : courses[0]?.id ?? 0,
  );
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessRole>("student");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const clean = normaliseMemberEmail(email);
    setEmailError(clean ? "" : "Enter a valid email address.");
    if (!clean) return;
    setBusy(true);
    const result = await addMember(courseId, clean, role);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (onDone) onDone(courseId, clean);
    else window.location.assign(`/access?course=${courseId}&added=${encodeURIComponent(clean)}`);
  }

  return (
    <FormCard label="Add people" onSubmit={submit}>
      <FieldRow>
        <Field id="member-course" label="Course" hint="The course to add them to.">
          <select id="member-course" value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}
            {...fieldAria("member-course", undefined, true)}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code}{c.name && c.name !== c.code ? `, ${c.name}` : ""}</option>)}
          </select>
        </Field>
        <Field id="member-email" label="Email" error={emailError}
          hint="Non-KU emails sign in with a password you create.">
          <input id="member-email" type="email" value={email} autoComplete="off" placeholder="name.s@ku.th"
            onChange={(e) => setEmail(e.target.value)} {...fieldAria("member-email", emailError, true)} />
        </Field>
      </FieldRow>
      <ChoiceGroup legend="Role" name="member-role" options={ROLES} value={role} onChange={setRole} columns={3} />
      <FormNote>
        The role applies to every course this person is in. They can sign in as soon as you add them.
      </FormNote>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <FormActions submitLabel="Add to course" busyLabel="Adding..." busy={busy} cancelHref={`/access?course=${courseId}`} />
    </FormCard>
  );
}

/** Create a course on the dashboard (SRS-23). Its own page: /access/courses/new. */
export function AccessCourseForm({ onDone }: { onDone?: (courseId: number) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [codeError, setCodeError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setCodeError(code.trim() ? "" : "Enter a course code.");
    if (!code.trim()) return;
    setBusy(true);
    const result = await createCourse(code.trim(), name.trim() || null);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const created = result.data;
    if (onDone) onDone(created.id);
    else window.location.assign(`/access?course=${created.id}&created=1`);
  }

  return (
    <FormCard label="New course" onSubmit={submit}>
      <FieldRow>
        <Field id="course-code" label="Course code" hint="As it appears in the KU course list." error={codeError}>
          <input id="course-code" value={code} maxLength={50} placeholder="01219245" autoComplete="off"
            onChange={(e) => setCode(e.target.value)} {...fieldAria("course-code", codeError, true)} />
        </Field>
        <Field id="course-name" label="Course name (optional)" hint="Shown next to the code.">
          <input id="course-name" value={name} maxLength={200} placeholder="Software Process"
            onChange={(e) => setName(e.target.value)} {...fieldAria("course-name", undefined, true)} />
        </Field>
      </FieldRow>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <FormActions submitLabel="Create course" busyLabel="Creating..." busy={busy} cancelHref="/access" />
    </FormCard>
  );
}
