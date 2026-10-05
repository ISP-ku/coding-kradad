import type { Consultation, FaqEntry, Homework, SessionUser } from "./types";

// UI preview mode: set UI_PREVIEW=1 in .env.local to browse every page with
// fake data (same data as source/test_ui.py), without a running backend.
export const PREVIEW = process.env.UI_PREVIEW === "1";
export const PREVIEW_COOKIE = "preview_user";

export function makePreviewUser(provider: string): SessionUser {
  const p = (
    ["discord", "google", "line"].includes(provider) ? provider : "discord"
  ) as SessionUser["provider"];
  return {
    id: "123456789012345678",
    username: "TestStudent",
    avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
    provider: p,
    email: p === "google" ? "teststudent@example.com" : undefined,
    classroom_courses:
      p === "google"
        ? [{ name: "Intro to Databases" }, { name: "Software Engineering Lab" }]
        : undefined,
  };
}

export const previewFaq: FaqEntry[] = [
  {
    question: "When is the midterm project due?",
    answer: "The midterm project is due Friday of Week 8, 23:59.",
    status: "Published",
    tags: ["deadline", "project"],
  },
  {
    question: "Can we use a different database for the final project?",
    answer: "Ask your lecturer for approval before switching database technology.",
    status: "Published",
    tags: ["project", "database"],
  },
  {
    question: "Is attendance in lab sessions mandatory?",
    answer: "",
    status: "Pending",
    tags: ["lab"],
  },
];

export const previewHomeworks: Homework[] = [
  { student: "TestStudent", assignment: "HW1 - ER Diagram", due_date: "2026-09-10", status: "Submitted" },
  { student: "TestStudent", assignment: "HW2 - API Design", due_date: "2026-09-17", status: "Missing" },
  { student: "TestStudent", assignment: "HW0 - Setup", due_date: "2026-08-30", status: "Late" },
];

export const previewAssignments = ["HW1 - ER Diagram", "HW2 - API Design", "HW3 - Final Report"];

export const previewConsultations: Consultation[] = [
  { id: 5, session_date: "2026-10-02", duration_minutes: 25, topic: "Pointer vs reference in Lab 4", participants: "Natthawut", created_at: "2026-10-02T14:12:00" },
  { id: 4, session_date: "2026-09-30", duration_minutes: 50, topic: "ER diagram: many-to-many for course enrolment", participants: "Group 7 (4 students)", created_at: "2026-09-30T16:40:00" },
  { id: 3, session_date: "2026-09-26", duration_minutes: 15, topic: "docker compose won't start", participants: "Pim", created_at: "2026-09-26T10:05:00" },
  { id: 2, session_date: "2026-09-24", duration_minutes: 90, topic: "Midterm project scope review", participants: "Group 2, Group 5", created_at: "2026-09-24T17:30:00" },
  { id: 1, session_date: "2026-09-19", duration_minutes: 35, topic: "Git merge conflict on a feature branch", participants: "Kwan, Tee", created_at: "2026-09-19T13:20:00" },
];
