import Link from "next/link";
import type { HomeworkItem, Topic } from "@/lib/types";
import styles from "./WaitingPanel.module.css";

export type WaitingItem = { title: string; detail: string; href: string; action: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What only this person can move forward: grading for a TA, approvals and progress for a lecturer. */
export function waitingItems(role: "ta" | "lecturer", homework: HomeworkItem[], pendingTopics: Topic[]): WaitingItem[] {
  if (role === "ta") {
    return homework
      .map((h) => ({ h, left: (h.submission_count ?? 0) - (h.graded_count ?? 0) }))
      .filter(({ left }) => left > 0)
      .map(({ h, left }) => ({
        title: h.title, detail: `${plural(left, "submission", "submissions")} to grade`, href: "/homework", action: "Grade",
      }));
  }
  const items: WaitingItem[] = [];
  if (pendingTopics.length) {
    items.push({
      title: `${plural(pendingTopics.length, "FAQ topic", "FAQ topics")} to approve`,
      detail: "They stay hidden until you review them.", href: "/faq", action: "Review",
    });
  }
  for (const h of homework) {
    if ((h.submission_count ?? 0) > 0) {
      items.push({ title: h.title, detail: `${h.submission_count} handed in, ${h.graded_count ?? 0} graded`, href: "/homework", action: "View" });
    }
  }
  return items;
}

export default function WaitingPanel({ items }: { items: WaitingItem[] }) {
  return (
    <section className={styles.panel} aria-labelledby="waiting-title">
      <h2 id="waiting-title">Waiting for you</h2>
      <p className={styles.hint}>Things only you can move forward.</p>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={`${item.href}-${item.title}`}>
              <div className={styles.text}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <Link className={styles.action} href={item.href} aria-label={`${item.action} ${item.title}`}>{item.action}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Nothing is waiting for you.</p>
      )}
    </section>
  );
}
