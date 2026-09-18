export type ClassroomCourse = {
  name: string;
};

export type SessionUser = {
  id: string;
  username: string;
  provider: "discord" | "google" | "line";
  avatar_url?: string;
  email?: string;
  classroom_courses?: ClassroomCourse[];
};

export type FaqStatus = "published" | "pending" | "rejected";

export type FaqEntry = {
  question: string;
  answer: string;
  status: FaqStatus;
  tags: string[];
};

export type HomeworkStatus = "submitted" | "missing" | "late";

export type Homework = {
  student: string;
  assignment: string;
  due_date: string;
  status: HomeworkStatus;
};
