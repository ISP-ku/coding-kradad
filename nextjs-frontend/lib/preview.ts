import type { ActivityReport, Comment, Consultation, SessionUser, Topic, TopicDetail } from "./types";

// UI preview mode: set UI_PREVIEW=1 in .env.local to browse every page with
// fake data (same data as source/test_ui.py), without a running backend.
export const PREVIEW = process.env.UI_PREVIEW === "1" && process.env.NODE_ENV !== "production";
export const PREVIEW_COOKIE = "preview_user";

export function makePreviewUser(): SessionUser {
  return {
    id: "preview-ku-user", username: "TestStudent", provider: "google",
    email: "teststudent@ku.th",
    // Lecturer so preview mode can browse every page, including the
    // lecturer-only Reports view (SRS-19). Real roles come from the backend.
    role: "lecturer",
  };
}

const previewComments: Record<number, Comment[]> = {
  1: [
    { id: 1, author: "google:ta-1", body: "It's due Friday of Week 8, 23:59 - no extensions.", created_at: "2026-09-02T10:15:00Z" },
    { id: 2, author: "google:student-9", body: "Does that include the report or just the code?", created_at: "2026-09-02T11:02:00Z" },
  ],
  2: [
    { id: 3, author: "google:lecturer-1", body: "Ask me before switching - most alternatives are fine.", created_at: "2026-09-05T09:40:00Z" },
  ],
};

export const previewTopics: Topic[] = [
  {
    id: 1,
    title: "When is the midterm project due?",
    description: "Trying to plan my week - is it the Friday of Week 8 or Week 9?",
    status: "Published",
    submitted_by: "google:student-3",
    created_at: "2026-09-01T08:00:00Z",
    comment_count: previewComments[1].length,
    saved: true,
  },
  {
    id: 2,
    title: "Can we use a different database for the final project?",
    description: "We'd like to use MongoDB instead of PostgreSQL - is that allowed?",
    status: "Published",
    submitted_by: "google:student-7",
    created_at: "2026-09-04T13:30:00Z",
    comment_count: previewComments[2].length,
    saved: false,
  },
  {
    id: 3,
    title: "Is attendance in lab sessions mandatory?",
    description: "I might need to miss one lab for a medical appointment.",
    status: "Pending",
    submitted_by: "google:student-2",
    created_at: "2026-09-06T16:45:00Z",
    comment_count: 0,
    saved: false,
  },
];

// Pending topics awaiting lecturer review (SRS-18), a subset of previewTopics.
export const previewPendingTopics: Topic[] = previewTopics.filter((t) => t.status === "Pending");

export const previewSavedTopics: Topic[] = previewTopics.filter((t) => t.saved);

export function previewTopicDetail(id: number): TopicDetail | null {
  const topic = previewTopics.find((t) => t.id === id);
  if (!topic) return null;
  return { ...topic, comments: previewComments[id] ?? [] };
}

export const previewConsultations: Consultation[] = [
  { id: 5, session_date: "2026-10-02", duration_minutes: 25, topic: "Pointer vs reference in Lab 4", participants: "Natthawut", created_at: "2026-10-02T14:12:00" },
  { id: 4, session_date: "2026-09-30", duration_minutes: 50, topic: "ER diagram: many-to-many for course enrolment", participants: "Group 7 (4 students)", created_at: "2026-09-30T16:40:00" },
  { id: 3, session_date: "2026-09-26", duration_minutes: 15, topic: "docker compose won't start", participants: "Pim", created_at: "2026-09-26T10:05:00" },
  { id: 2, session_date: "2026-09-24", duration_minutes: 90, topic: "Midterm project scope review", participants: "Group 2, Group 5", created_at: "2026-09-24T17:30:00" },
  { id: 1, session_date: "2026-09-19", duration_minutes: 35, topic: "Git merge conflict on a feature branch", participants: "Kwan, Tee", created_at: "2026-09-19T13:20:00" },
];

export const previewReportCourses = ["01219245-intro-db", "01219343-se-lab"];

export function makePreviewReport(courseId: string): ActivityReport {
  return {
    course_id: courseId,
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    has_records: true,
    activity_count: 2,
    status_summary: { Done: 2, "Not Started": 1 },
    consultations: { count: 3, total_minutes: 105, scope: "all_courses" },
    activities: [
      {
        id: 1,
        title: "HW1 - ER Diagram grading",
        type: "deadline",
        starts_at: "2026-09-10T23:59:00",
        location: "online",
        created_by: "google:lecturer-preview",
        archived_at: null,
        tasks: [
          {
            id: 1,
            assignee_id: "google:ta-preview",
            status: "Done",
            assigned_at: "2026-09-01T09:00:00",
            status_changed_at: "2026-09-11T10:00:00",
          },
        ],
      },
      {
        id: 2,
        title: "Week 3 Lab",
        type: "lab",
        starts_at: "2026-09-17T13:00:00",
        location: "Room 204",
        created_by: "google:lecturer-preview",
        archived_at: "2026-09-20T09:00:00",
        tasks: [
          {
            id: 2,
            assignee_id: "google:ta-preview",
            status: "Done",
            assigned_at: "2026-09-01T09:00:00",
            status_changed_at: "2026-09-17T15:00:00",
          },
          {
            id: 3,
            assignee_id: "google:ta-preview-2",
            status: "Not Started",
            assigned_at: "2026-09-01T09:00:00",
            status_changed_at: null,
          },
        ],
      },
    ],
  };
}
