/**
 * Homework calls for client components. None of them throw: a failure comes
 * back as `{ error }` with a message ready to show in the form.
 */
import { request } from "./request";
import type { HomeworkItem, HomeworkSubmission } from "./types";

type Result<K extends string, T> = { [key in K]: T } | { error: string };

/** Everything students handed in for one homework (TA and lecturer). */
export async function loadSubmissions(homeworkId: number): Promise<Result<"submissions", HomeworkSubmission[]>> {
  const r = await request<HomeworkSubmission[]>(`/api/homework/${homeworkId}/submissions`, {
    fallback: "Could not load submissions.",
  });
  return "error" in r ? r : { submissions: r.data };
}

/** Give a submission its score and feedback (TA only). */
export async function gradeSubmission(
  sub: Pick<HomeworkSubmission, "id" | "homework_id">, score: number, feedback: string,
): Promise<Result<"submission", HomeworkSubmission>> {
  const r = await request<HomeworkSubmission>(`/api/homework/${sub.homework_id}/submissions/${sub.id}`, {
    method: "PATCH", body: { score, feedback }, fallback: "Could not save the grade. Please try again.",
  });
  return "error" in r ? r : { submission: r.data };
}

/** Hand in, or replace, the signed-in student's answer. */
export async function submitHomework(homeworkId: number, answer: string): Promise<Result<"submission", HomeworkSubmission>> {
  const r = await request<HomeworkSubmission>(`/api/homework/${homeworkId}/submissions`, {
    method: "POST", body: { answer }, fallback: "Could not hand this in right now. Please try again.",
  });
  return "error" in r ? r : { submission: r.data };
}

export type NewHomework = Pick<HomeworkItem, "course_id" | "title" | "description" | "due_at" | "max_score">;

/** Assign a new homework to a course (lecturer only). */
export async function assignHomework(homework: NewHomework): Promise<Result<"homework", HomeworkItem>> {
  const r = await request<HomeworkItem>("/api/homework", {
    method: "POST", body: homework, fallback: "Could not assign the homework. Please check every field.",
  });
  return "error" in r ? r : { homework: r.data };
}
