"use client";

import { useEffect, useState } from "react";
import type { Consultation } from "@/lib/types";
import styles from "./ConsultationLog.module.css";

type Props = {
  initial: Consultation[];
  /** Preview mode has no backend, so new entries are only kept on this page. */
  preview: boolean;
};

type Errors = Partial<Record<"session_date" | "duration_minutes" | "topic" | "participants", string>>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Newest session first (SRS-15); ties broken by id.
const sortNewestFirst = (list: Consultation[]) =>
  [...list].sort((a, b) =>
    a.session_date === b.session_date ? b.id - a.id : a.session_date < b.session_date ? 1 : -1,
  );

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

export default function ConsultationLog({ initial, preview }: Props) {
  const [entries, setEntries] = useState<Consultation[]>(sortNewestFirst(initial));
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
    setDate((d) => d || new Date().toLocaleDateString("en-CA"));
  }, []);

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

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

    setSaving(true);
    try {
      let saved: Consultation;
      if (preview) {
        const nextId = entries.reduce((max, x) => Math.max(max, x.id), 0) + 1;
        saved = { ...payload, id: nextId, created_at: new Date().toISOString() };
      } else {
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
          setFormError(
            res.status === 422
              ? "The server rejected the form. Please check every field."
              : "Could not save right now. Please try again.",
          );
          return;
        }
        saved = (await res.json()) as Consultation;
      }

      setEntries((list) => sortNewestFirst([saved, ...list]));
      setDuration("");
      setTopic("");
      setParticipants("");
      setNotice(preview ? "Added (preview mode: this is not saved to the database)." : "Consultation saved.");
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    id: keyof Errors,
    label: string,
    input: React.ReactNode,
    full = false,
  ) => (
    <div className={full ? `${styles.field} ${styles.full}` : styles.field}>
      <label htmlFor={id}>{label}</label>
      {input}
      {errors[id] && (
        <span className={styles.fieldError} id={`${id}-error`}>
          {errors[id]}
        </span>
      )}
    </div>
  );

  const aria = (id: keyof Errors) => ({
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? `${id}-error` : undefined,
  });

  return (
    <>
      <form className={styles.panel} onSubmit={onSubmit} noValidate>
        <h3>Record a consultation</h3>
        <p className={styles.hint}>Every field is required. Saved sessions appear in your history below.</p>

        <div className={styles.grid}>
          {field(
            "session_date",
            "Date",
            <input id="session_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} {...aria("session_date")} />,
          )}
          {field(
            "duration_minutes",
            "Duration (minutes)",
            <input
              id="duration_minutes"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="e.g. 45"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              {...aria("duration_minutes")}
            />,
          )}
          {field(
            "topic",
            "Topic",
            <input
              id="topic"
              type="text"
              maxLength={200}
              placeholder="e.g. ER diagram for the hotel database"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              {...aria("topic")}
            />,
            true,
          )}
          {field(
            "participants",
            "Participants",
            <input
              id="participants"
              type="text"
              maxLength={300}
              placeholder="e.g. Group 3, or student names"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              {...aria("participants")}
            />,
            true,
          )}
        </div>

        {formError && (
          <div className={styles.alert} role="alert">
            {formError}
          </div>
        )}
        {notice && (
          <div className={styles.notice} role="status">
            {notice}
          </div>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.btn} disabled={saving}>
            {saving ? "Saving..." : "Save consultation"}
          </button>
        </div>
      </form>

      <div className={styles.summary}>
        <h3>My consultation history</h3>
        {entries.length > 0 && (
          <span>
            {entries.length} {entries.length === 1 ? "session" : "sessions"} · {formatDuration(totalMinutes)} in total
          </span>
        )}
      </div>

      {entries.length > 0 ? (
        entries.map((c) => (
          <div className={styles.card} key={c.id}>
            <div className={styles.topic}>{c.topic}</div>
            <div className={styles.meta}>
              <span>{formatDate(c.session_date)}</span>
              <span className={`${styles.chip} ${styles.chipDuration}`}>{formatDuration(c.duration_minutes)}</span>
              <span className={styles.chip}>{c.participants}</span>
            </div>
          </div>
        ))
      ) : (
        <p className={styles.empty}>No consultations recorded yet. Your first one will show up here.</p>
      )}
    </>
  );
}
