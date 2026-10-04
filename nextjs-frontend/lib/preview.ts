import type { FaqEntry, Homework, SessionUser } from "./types";

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
