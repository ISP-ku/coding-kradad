"use client";

import { useState } from "react";
import type { ActivityAssignee, CourseActivity } from "@/lib/types";
import {
  ChoiceGroup, Field, FieldRow, FormActions, FormCard, FormMessage, QuickPicks,
  daysFromNow, fieldAria, localDate, type Choice,
} from "./form/FormKit";

type Type = CourseActivity["type"];
type Values = { course_id: string; title: string; type: Type | ""; date: string; time: string; location: string; assignee_id: string };
type Errors = Partial<Record<keyof Values, string>>;

const TYPES: Choice<Type>[] = [
  { value: "deadline", label: "Deadline", hint: "Something is due" },
  { value: "lab", label: "Lab session", hint: "A scheduled lab" },
  { value: "consultation", label: "Consultation slot", hint: "Time to help students" },
  { value: "milestone", label: "Milestone", hint: "A project checkpoint" },
];
const TIMES = ["09:00", "13:00", "17:00", "23:59"];

function splitLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: localDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function validate(v: Values, mode: "create" | "edit"): Errors {
  const e: Errors = {};
  if (!v.course_id.trim()) e.course_id = "Enter the course code.";
  if (!v.title.trim()) e.title = "Give the activity a title.";
  if (!v.type) e.type = "Choose what kind of activity this is.";
  if (!v.date) e.date = "Pick a date.";
  if (!v.time) e.time = "Pick a time.";
  if (!v.location.trim()) e.location = "Say where it happens.";
  if (mode === "create" && !v.assignee_id) e.assignee_id = "Choose a TA.";
  return e;
}

type Props =
  | { mode: "create"; assignees: ActivityAssignee[]; courses?: string[]; activity?: undefined; onSaved?: () => void }
  | { mode: "edit"; activity: CourseActivity; courses?: string[]; assignees?: undefined; onSaved?: () => void };

/**
 * Create or edit a course activity (SRS-2, SRS-3, SRS-5, SRS-8). Creating
 * also assigns it to a TA; editing keeps existing tasks and statuses.
 */
export default function ActivityForm(props: Props) {
  const { mode, courses = [], onSaved } = props;
  const start = props.activity ? splitLocal(props.activity.starts_at) : { date: "", time: "" };
  const [values, setValues] = useState<Values>({
    course_id: props.activity?.course_id ?? "",
    title: props.activity?.title ?? "",
    type: props.activity?.type ?? "",
    date: start.date,
    time: start.time,
    location: props.activity?.location ?? "",
    assignee_id: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const assignees = props.mode === "create" ? props.assignees : [];
  const noTas = mode === "create" && assignees.length === 0;

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    const found = validate(values, mode);
    setErrors(found);
    if (Object.keys(found).length) return;

    const body = {
      course_id: values.course_id.trim(),
      title: values.title.trim(),
      type: values.type,
      starts_at: new Date(`${values.date}T${values.time}`).toISOString(),
      location: values.location.trim(),
      ...(mode === "create" ? { assignee_id: values.assignee_id } : {}),
    };
    setSaving(true);
    try {
      const url = mode === "create" ? "/api/activities" : `/api/activities/${props.activity!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? "Could not save this activity.");
      if (onSaved) onSaved();
      else window.location.assign(`/dashboard?${mode === "create" ? "added" : "updated"}=1`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this activity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormCard label={mode === "create" ? "New activity" : "Edit activity"} onSubmit={submit}>
      <FieldRow>
        <Field id="act-course" label="Course" hint="The course code, e.g. 01219245" error={errors.course_id}>
          <input id="act-course" value={values.course_id} maxLength={100} list={courses.length ? "activity-courses" : undefined}
            autoComplete="off" onChange={(e) => set("course_id", e.target.value)} {...fieldAria("act-course", errors.course_id, true)} />
          {courses.length > 0 && (
            <datalist id="activity-courses">{courses.map((c) => <option key={c} value={c} />)}</datalist>
          )}
        </Field>
        <Field id="act-title" label="Title" error={errors.title} count={{ value: values.title, max: 200 }}>
          <input id="act-title" value={values.title} maxLength={200} placeholder="e.g. Lab 4 room setup"
            onChange={(e) => set("title", e.target.value)} {...fieldAria("act-title", errors.title)} />
        </Field>
      </FieldRow>

      <ChoiceGroup legend="Activity type" name="act-type" options={TYPES} value={values.type} columns={4}
        onChange={(t) => set("type", t)} error={errors.type} />

      <div>
        <FieldRow>
          <Field id="act-date" label="Date" error={errors.date}>
            <input id="act-date" type="date" value={values.date} onChange={(e) => set("date", e.target.value)}
              {...fieldAria("act-date", errors.date)} />
          </Field>
          <Field id="act-time" label="Time" error={errors.time}>
            <input id="act-time" type="time" value={values.time} onChange={(e) => set("time", e.target.value)}
              {...fieldAria("act-time", errors.time)} />
          </Field>
        </FieldRow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 10 }}>
          <QuickPicks label="Quick dates" picks={[
            { label: "Today", onPick: () => set("date", localDate(new Date())) },
            { label: "Tomorrow", onPick: () => set("date", localDate(daysFromNow(1))) },
            { label: "In a week", onPick: () => set("date", localDate(daysFromNow(7))) },
          ]} />
          <QuickPicks label="Quick times" picks={TIMES.map((t) => ({ label: t, onPick: () => set("time", t), active: values.time === t }))} />
        </div>
      </div>

      <Field id="act-location" label="Location or meeting link" error={errors.location}>
        <input id="act-location" value={values.location} maxLength={200} placeholder="Room E204, or an online meeting link"
          onChange={(e) => set("location", e.target.value)} {...fieldAria("act-location", errors.location)} />
      </Field>

      {mode === "create" && (
        <Field id="act-ta" label="Assign to TA" hint="They will see it on their dashboard straight away." error={errors.assignee_id}>
          <select id="act-ta" value={values.assignee_id} disabled={noTas}
            onChange={(e) => set("assignee_id", e.target.value)} {...fieldAria("act-ta", errors.assignee_id, true)}>
            <option value="">Choose a TA</option>
            {assignees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}

      {noTas && (
        <FormMessage kind="notice">
          No TA accounts yet. A TA appears here after they have signed in once; add them on the Access page first.
        </FormMessage>
      )}
      {mode === "edit" && <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>The assigned TA and their task status stay as they are.</p>}
      {formError && <FormMessage kind="error">{formError}</FormMessage>}

      <FormActions
        submitLabel={mode === "create" ? "Save and assign" : "Save changes"}
        busyLabel="Saving..."
        busy={saving}
        disabled={noTas}
        cancelHref="/dashboard"
      />
    </FormCard>
  );
}
