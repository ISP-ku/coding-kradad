export type ClassroomCourse = {
  name: string;
};

export type SessionUser = {
  id: string;
  username: string;
  provider: "google" | "local" | "email";
  role?: "student" | "ta" | "lecturer"; // SRS-18, SRS-22
  auth_method?: "ku_google" | "local_test";
  avatar_url?: string;
  email?: string;
  student_id?: string;
  classroom_courses?: ClassroomCourse[];
};

export type Comment = {
  id: number;
  author: string;
  body: string;
  created_at: string;
};

export type Topic = {
  id: number;
  title: string;
  description: string;
  status: string; // "Published" | "Pending" | "Rejected" (any casing)
  submitted_by: string;
  created_at: string;
  comment_count: number;
  saved: boolean;
};

export type TopicDetail = Topic & {
  comments: Comment[];
};

export type Consultation = {
  id: number;
  session_date: string; // "YYYY-MM-DD"
  duration_minutes: number;
  topic: string;
  participants: string;
  created_at: string;
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

export type ActivityTask = {
  id: number;
  assignee_id: string;
  assignee_name: string;
  status: "Not Started" | "In Progress" | "Done";
  assigned_at: string;
  status_changed_at: string | null;
  is_overdue: boolean;
  is_at_risk: boolean;
};

export type CourseActivity = {
  id: number;
  course_id: string;
  title: string;
  type: "deadline" | "lab" | "consultation" | "milestone";
  starts_at: string;
  location: string;
  created_by: string;
  archived_at?: string | null;
  tasks: ActivityTask[];
};

export type ActivityAssignee = { id: string; name: string };

// Mirrors source/homework.py (lecturer assigns, students submit, TAs grade).
export type HomeworkSubmission = {
  id: number;
  homework_id: number;
  student_name: string;
  answer: string;
  submitted_at: string;
  is_late: boolean;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
};

export type HomeworkStatus = "todo" | "submitted" | "graded";

export type HomeworkItem = {
  id: number;
  course_id: string;
  title: string;
  description: string;
  due_at: string;
  max_score: number;
  created_at: string;
  // Student view only:
  status: HomeworkStatus | null;
  is_overdue: boolean;
  my_submission: HomeworkSubmission | null;
  // TA / lecturer view only:
  submission_count: number | null;
  graded_count: number | null;
};
