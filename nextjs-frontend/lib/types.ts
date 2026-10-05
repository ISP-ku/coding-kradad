export type ClassroomCourse = {
  name: string;
};

export type SessionUser = {
  id: string;
  username: string;
  provider: "google" | "local";
  role?: "student" | "ta" | "lecturer"; // SRS-18, SRS-22
  auth_method?: "ku_google" | "local_test";
  avatar_url?: string;
  email?: string;
  student_id?: string;
  classroom_courses?: ClassroomCourse[];
};

export type FaqEntry = {
  question: string;
  answer: string;
  status: string; // "Published" | "Pending" | "Rejected" (any casing)
  tags: string[];
};

export type Homework = {
  student: string;
  assignment: string;
  due_date: string;
  status: string; // "Submitted" | "Missing" | "Late" (any casing)
};

// Mirrors source/reports.py's TaskOut / ActivityOut / ActivityReport (SRS-19, SRS-20).
export type ReportTask = {
  id: number;
  assignee_id: string;
  status: string; // "Not Started" | "In Progress" | "Done"
  assigned_at: string;
  status_changed_at: string | null;
};

export type ReportActivity = {
  id: number;
  title: string;
  type: string; // "deadline" | "lab" | "consultation" | "milestone"
  starts_at: string;
  location: string;
  created_by: string;
  archived_at: string | null; // set when archived; otherwise completed (already happened)
  tasks: ReportTask[];
};

export type ConsultationSummary = {
  count: number;
  total_minutes: number;
  scope: "all_courses"; // consultations aren't linked to a course yet
};

export type ActivityReport = {
  course_id: string;
  start_date: string;
  end_date: string;
  has_records: boolean;
  activity_count: number;
  status_summary: Record<string, number>;
  activities: ReportActivity[];
  consultations: ConsultationSummary;
};
