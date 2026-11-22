/**
 * Homework calls for client components. None of them throw: a failure comes
 * back as `{ error }` with a message ready to show in the form.
 */
import { errorMessage } from "./errors";
import type { HomeworkItem, HomeworkSubmission } from "./types";

const OFFLINE = "Could not reach the server. Please try again.";

type Result<K extends string, T> = { [key in K]: T } | { error: string };

function sendJson(url: string, method: "POST" | "PATCH", body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Everything students handed in for one homework (TA and lecturer). */
export async function loadSubmissions(homeworkId: number): Promise<Result<"submissions", HomeworkSubmission[]>> {
  try {
    const res = await fetch(`/api/homework/${homeworkId}/submissions`);
    if (!res.ok) return { error: await errorMessage(res, "Could not load submissions.") };
    return { submissions: (await res.json()) as HomeworkSubmission[] };
  } catch {
    return { error: OFFLINE };
  }
}

/** Give a submission its score and feedback (TA only). */
export async function gradeSubmission(
  sub: Pick<HomeworkSubmission, "id" | "homework_id">, score: number, feedback: string,
): Promise<Result<"submission", HomeworkSubmission>> {
  try {
    const res = await sendJson(`/api/homework/${sub.homework_id}/submissions/${sub.id}`, "PATCH", { score, feedback });
    if (!res.ok) return { error: await errorMessage(res, "Could not save the grade. Please try again.") };
    return { submission: (await res.json()) as HomeworkSubmission };
  } catch {
    return { error: OFFLINE };
  }
}

/** Hand in, or replace, the signed-in student's answer. */
export async function submitHomework(homeworkId: number, answer: string): Promise<Result<"submission", HomeworkSubmission>> {
  try {
    const res = await sendJson(`/api/homework/${homeworkId}/submissions`, "POST", { answer });
    if (!res.ok) return { error: await errorMessage(res, "Could not hand this in right now. Please try again.") };
    return { submission: (await res.json()) as HomeworkSubmission };
  } catch {
    return { error: OFFLINE };
  }
}

export type NewHomework = Pick<HomeworkItem, "course_id" | "title" | "description" | "due_at" | "max_score">;

/** Assign a new homework to a course (lecturer only). */
export async function assignHomework(homework: NewHomework): Promise<Result<"homework", HomeworkItem>> {
  try {
    const res = await sendJson("/api/homework", "POST", homework);
    if (!res.ok) return { error: await errorMessage(res, "Could not assign the homework. Please check every field.") };
    return { homework: (await res.json()) as HomeworkItem };
  } catch {
    return { error: OFFLINE };
  }
}
