import { dueText } from "@/lib/homework";
import type { HomeworkItem } from "@/lib/types";
import styles from "./HomeworkStudent.module.css";

/** Where a homework stands, as the by-course board labels it. */
function stateOf(h: HomeworkItem): { label: string; className: string } {
  const sub = h.my_submission;
  const label = h.status === "graded" && sub ? `Graded ${sub.score} / ${h.max_score}`
    : h.status === "submitted" ? "Handed in" : h.is_overdue ? "Missing" : "Assigned";
  const className = h.status === "graded" ? styles.graded : h.is_overdue && h.status === "todo" ? styles.missing : styles.handed;
  return { label, className };
}

/** One section per course, newest due date first, with how much is left to hand in. */
export default function HomeworkByCourse({ items, courses, colourOf, todoIn, onOpen }: {
  items: HomeworkItem[];
  /** The courses to show, in order. */
  courses: string[];
  colourOf: (course: string) => string;
  todoIn: (course: string) => number;
  /** Open a homework to hand it in. */
  onOpen: (item: HomeworkItem) => void;
}) {
  return (
    <div className={styles.board}>
      {courses.map((code) => {
        const posts = items.filter((h) => h.course_id === code).sort((a, b) => b.due_at.localeCompare(a.due_at));
        const left = todoIn(code);
        return (
          <section key={code} className={`${styles.courseCard} ${colourOf(code)}`} aria-label={code}>
            <div className={styles.band}>
              <strong>{code}</strong>
              <span>{left ? `${left} to hand in` : "All handed in"}</span>
            </div>
            {posts.map((h) => {
              const state = stateOf(h);
              return (
                <div className={styles.post} key={h.id}>
                  <div className={styles.postTop}>
                    <span className={styles.postTitle}>{h.title}</span>
                    <span className={state.className}>{state.label}</span>
                  </div>
                  <span className={styles.postDue}>{dueText(h.due_at)}</span>
                  {h.status !== "graded" && (
                    <button type="button" className={styles.quiet} aria-label={`Open ${h.title}`}
                      onClick={() => onOpen(h)}>
                      Open
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
