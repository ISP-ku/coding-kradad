"use client";

import { useState } from "react";
import { Field, FormActions, FormCard, FormMessage, fieldAria } from "./form/FormKit";

type Props = {
  preview?: boolean;
  /** Called after a successful send; without it the page returns to the board. */
  onSubmitted?: () => void;
};

type Errors = Partial<Record<"title" | "description", string>>;

/** Start a new FAQ topic (SRS-16, SRS-17). It stays Pending until a lecturer approves it (SRS-18). */
export default function TopicForm({ preview = false, onSubmitted }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");
    const found: Errors = {};
    if (!title.trim()) found.title = "Give your topic a title.";
    if (!description.trim()) found.description = "Add a few words so others can answer.";
    setErrors(found);
    if (Object.keys(found).length) {
      setError("Please fill in both the title and the description.");
      return;
    }
    if (preview) {
      setNotice("Sent (preview mode: this is not saved).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      if (res.status === 401) {
        setError("Please sign in to create a topic.");
        return;
      }
      if (!res.ok) {
        setError("The topic could not be saved. Please check both fields and try again.");
        return;
      }
      if (onSubmitted) onSubmitted();
      else window.location.assign("/faq?submitted=1");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormCard label="New topic" onSubmit={submit}>
      <p style={{ margin: 0, padding: "12px 14px", borderRadius: 12, background: "var(--raised)", color: "var(--soft)", fontSize: 14 }}>
        New topics are saved as Pending and only appear on the board after a lecturer approves them.
      </p>
      <Field id="topic-title" label="Title" hint="Ask it the way you would search for it." error={errors.title} count={{ value: title, max: 300 }}>
        <input id="topic-title" value={title} maxLength={300} placeholder="e.g. When is the midterm project due?"
          onChange={(e) => setTitle(e.target.value)} {...fieldAria("topic-title", errors.title, true)} />
      </Field>
      <Field id="topic-description" label="Description" hint="What you already tried, and anything that helps someone answer."
        error={errors.description} count={{ value: description, max: 2000 }}>
        <textarea id="topic-description" rows={6} value={description} maxLength={2000}
          placeholder="e.g. The course page says week 8, but the slides say week 9."
          onChange={(e) => setDescription(e.target.value)} {...fieldAria("topic-description", errors.description, true)} />
      </Field>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {notice && <FormMessage kind="notice">{notice}</FormMessage>}
      <FormActions submitLabel="Send for approval" busyLabel="Sending..." busy={submitting} cancelHref="/faq" />
    </FormCard>
  );
}
