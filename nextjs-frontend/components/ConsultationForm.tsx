"use client";

import { useEffect, useState } from "react";
import {
  Field, FieldRow, FormActions, FormCard, FormMessage, QuickPicks, daysFromNow, fieldAria, localDate,
} from "./form/FormKit";

type Props = {
  /** Preview mode has no backend, so nothing is saved. */
  preview: boolean;
};

type Errors = Partial<Record<"session_date" | "duration_minutes" | "topic" | "participants", string>>;

const DURATIONS = [15, 30, 45, 60];

// Same required-field rules as the backend (SRS-14), so people get feedback before sending.
function validate(date: string, duration: string, topic: string, participants: string): Errors {
  const errors: Errors = {};
  if (!date) errors.session_date = "Please pick the date.";
  const minutes = Number(duration);
  if (!duration.trim() || !Number.isInteger(minutes) || minutes <= 0) {
    errors.duration_minutes = "Enter the duration as a whole number of minutes (1 or more).";
  }
  if (!topic.trim()) errors.topic = "Please enter the topic.";
  if (!participants.trim()) errors.participants = "Please enter who took part.";
  return errors;
}

/** Record a consultation session a TA ran (SRS-14). Saved sessions show in the history (SRS-15). */
export default function ConsultationForm({ preview }: Props) {
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState("");
  const [topic, setTopic] = useState("");
  const [participants, setParticipants] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  // Default the date to today (client-only, avoids a server/client mismatch).
  useEffect(() => {
    setDate((d) => d || localDate(new Date()));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice("");
    setFormError("");

    const found = validate(date, duration, topic, participants);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = {
      session_date: date,
      duration_minutes: Number(duration),
      topic: topic.trim(),
      participants: participants.trim(),
    };

    if (preview) {
      setNotice("Preview mode: this consultation is not saved to the database.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setFormError("Your session has ended. Please sign in again.");
        return;
      }
      if (!res.ok) {
        setFormError(res.status === 422
          ? "The server rejected the form. Please check every field."
          : "Could not save right now. Please try again.");
        return;
      }
      // Back to the history list, which now includes the new session (SRS-15).
      window.location.assign("/consultations?saved=1");
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormCard label="Record consultation" onSubmit={onSubmit}>
      <FieldRow>
        <Field id="session_date" label="Date" error={errors.session_date}>
          <input id="session_date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
            {...fieldAria("session_date", errors.session_date)} />
          <QuickPicks label="Quick dates" picks={[
            { label: "Today", onPick: () => setDate(localDate(new Date())), active: date === localDate(new Date()) },
            { label: "Yesterday", onPick: () => setDate(localDate(daysFromNow(-1))), active: date === localDate(daysFromNow(-1)) },
          ]} />
        </Field>
        <Field id="duration_minutes" label="Duration (minutes)" error={errors.duration_minutes}>
          <input id="duration_minutes" type="number" inputMode="numeric" min={1} step={1} placeholder="e.g. 45"
            value={duration} onChange={(e) => setDuration(e.target.value)} {...fieldAria("duration_minutes", errors.duration_minutes)} />
          <QuickPicks label="Common lengths" picks={DURATIONS.map((m) => ({
            label: `${m} min`, onPick: () => setDuration(String(m)), active: duration === String(m),
          }))} />
        </Field>
      </FieldRow>

      <Field id="topic" label="Topic" hint="What you helped with." error={errors.topic} count={{ value: topic, max: 200 }}>
        <input id="topic" type="text" maxLength={200} placeholder="e.g. ER diagram for the hotel database"
          value={topic} onChange={(e) => setTopic(e.target.value)} {...fieldAria("topic", errors.topic, true)} />
      </Field>

      <Field id="participants" label="Participants" hint="A group name or the students' names." error={errors.participants} count={{ value: participants, max: 300 }}>
        <input id="participants" type="text" maxLength={300} placeholder="e.g. Group 3, or Krit and Ploy"
          value={participants} onChange={(e) => setParticipants(e.target.value)} {...fieldAria("participants", errors.participants, true)} />
      </Field>

      {formError && <FormMessage kind="error">{formError}</FormMessage>}
      {notice && <FormMessage kind="notice">{notice}</FormMessage>}
      <FormActions submitLabel="Save consultation" busyLabel="Saving..." busy={saving} cancelHref="/consultations" />
    </FormCard>
  );
}
