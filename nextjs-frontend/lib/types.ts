export type ClassroomCourse = {
  name: string;
};

export type SessionUser = {
  id: string;
  username: string;
  provider: "discord" | "google" | "line";
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

export type Consultation = {
  id: number;
  session_date: string; // "YYYY-MM-DD"
  duration_minutes: number;
  topic: string;
  participants: string;
  created_at: string;
};
