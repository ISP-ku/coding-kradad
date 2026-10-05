export type ClassroomCourse = {
  name: string;
};

export type SessionUser = {
  id: string;
  username: string;
  provider: "google" | "local";
  role?: "student" | "ta" | "lecturer";
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
