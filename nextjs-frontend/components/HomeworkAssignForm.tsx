"use client";

import { useState } from "react";
import { errorMessage, localInputToIso } from "@/lib/homework";
import type { HomeworkItem } from "@/lib/types";
import {
  Field, FieldRow, FormActions, FormCard, FormMessage, QuickPicks, daysFromNow, fieldAria, localDate,
} from "./form/FormKit";

type Errors = Partial<Record<"course_id" | "title" | "due_at" | "max_score", string>>;

const POINTS = [10, 20, 50, 100];
const dueIn = (days: number) => `${localDate(daysFromNow(days))}T23:59`;

/**
 * Lecturer-only form that assigns a new homework to the whole course. It has
 * its own page (/homework/new); after assigning it returns to the homework list
 * unless a caller handles the new item itself.
 */
export default function HomeworkAssignForm({ onCreated, courses = [] }: {
  onCreated?: (item: HomeworkItem) => void;
  /** Course codes to suggest while typing. */
  courses?: string[];
}) {
  const [course, setCourse] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [max, setMax] = useState("100");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice("");
    setFormError("");
    const found: Errors = {};
    if (!course.trim()) found.course_id = "Please enter the course code.";
    if (!title.trim()) found.title = "Please enter a title.";
    const dueIso = localInputToIso(due);
    if (!dueIso) found.due_at = "Please pick the due date and time.";
    const points = Number(max);
    if (!Number.isInteger(points) || points < 1 || points > 1000) found.max_score = "Enter a whole number from 1 to 1000.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const res = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.trim(), title: title.trim(), description: description.trim(),
          due_at: dueIso, max_score: points,
        }),
      });
      if (!res.ok) {
        setFormError(await errorMessage(res, "Could not assign the homework. Please check every field."));
        return;
      }
      const created = (await res.json()) as HomeworkItem;
      if (!onCreated) {
        window.location.assign("/homework?assigned=1");
        return;
      }
      onCreated(created);
      setCourse(""); setTitle(""); setDescription(""); setDue(""); setMax("100");
      setNotice("Homework assigned. Students can see it now.");
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormCard label="Assign homework" onSubmit={submit}>
      <FieldRow>
        <Field id="hw-course" label="Course" hint="Everyone in this course gets it." error={errors.course_id}>
          <input id="hw-course" value={course} maxLength={100} placeholder="e.g. 01219245" autoComplete="off"
            list={courses.length ? "homework-courses" : undefined}
            onChange={(e) => setCourse(e.target.value)} {...fieldAria("hw-course", errors.course_id, true)} />
          {courses.length > 0 && <datalist id="homework-courses">{courses.map((c) => <option key={c} value={c} />)}</datalist>}
        </Field>
        <Field id="hw-title" label="Title" hint="Students see this in their list." error={errors.title} count={{ value: title, max: 200 }}>
          <input id="hw-title" value={title} maxLength={200} placeholder="e.g. HW3: SQL joins"
            onChange={(e) => setTitle(e.target.value)} {...fieldAria("hw-title", errors.title, true)} />
        </Field>
      </FieldRow>

      <Field id="hw-desc" label="Instructions" optional hint="What to do and how to hand it in." count={{ value: description, max: 2000 }}>
        <textarea id="hw-desc" value={description} maxLength={2000} placeholder="e.g. Answer questions 1 to 5 and paste a link to your notebook."
          onChange={(e) => setDescription(e.target.value)} {...fieldAria("hw-desc", undefined, true)} />
      </Field>

      <FieldRow>
        <Field id="hw-due" label="Due date and time" error={errors.due_at}>
          <input id="hw-due" type="datetime-local" value={due}
            onChange={(e) => setDue(e.target.value)} {...fieldAria("hw-due", errors.due_at)} />
          <QuickPicks label="Quick due dates" picks={[
            { label: "Tomorrow", onPick: () => setDue(dueIn(1)) },
            { label: "In a week", onPick: () => setDue(dueIn(7)) },
            { label: "In 2 weeks", onPick: () => setDue(dueIn(14)) },
          ]} />
        </Field>
        <Field id="hw-max" label="Maximum score" error={errors.max_score}>
          <input id="hw-max" type="number" inputMode="numeric" min={1} max={1000} step={1} value={max}
            onChange={(e) => setMax(e.target.value)} {...fieldAria("hw-max", errors.max_score)} />
          <QuickPicks label="Common scores" picks={POINTS.map((n) => ({
            label: `${n} points`, onPick: () => setMax(String(n)), active: max === String(n),
          }))} />
        </Field>
      </FieldRow>

      {formError && <FormMessage kind="error">{formError}</FormMessage>}
      {notice && <FormMessage kind="notice">{notice}</FormMessage>}
      <FormActions submitLabel="Assign homework" busyLabel="Assigning..." busy={busy} cancelHref="/homework" />
    </FormCard>
  );
}
