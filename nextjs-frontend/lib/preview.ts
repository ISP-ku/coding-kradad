import type { ActivityReport, FaqEntry, Homework, SessionUser } from "./types";

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
