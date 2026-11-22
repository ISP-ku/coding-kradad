import type { ReactNode } from "react";
import { dayKey, fmt } from "@/lib/homework";
import type { HomeworkItem } from "@/lib/types";
import styles from "./HomeworkStudent.module.css";

export type Month = { y: number; m: number };

const longDay = (d: Date) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(d);

/**
 * Month calendar of homework due dates, Monday first, with the selected
 * day's homework listed underneath. The month and selected day live in the
 * parent so they survive switching views.
 */
export default function HomeworkCalendar({ items, today, month, onMonth, selected, onSelect, colourOf, renderCard }: {
  items: HomeworkItem[];
  today: Date;
  month: Month;
  onMonth: (update: (current: Month) => Month) => void;
  /** YYYY-MM-DD */
  selected: string;
  onSelect: (day: string) => void;
  colourOf: (course: string) => string;
  renderCard: (item: HomeworkItem) => ReactNode;
}) {
  const first = new Date(month.y, month.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => i - offset + 1);
  const byDay = new Map<string, HomeworkItem[]>();
  for (const h of items) {
    const k = dayKey(new Date(h.due_at));
    byDay.set(k, [...(byDay.get(k) ?? []), h]);
  }
  const monthName = fmt({ month: "long" }).format(first);
  const selectedDate = new Date(`${selected}T12:00:00`);
  const selectedItems = byDay.get(selected) ?? [];
  const step = (n: number) => onMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calHead}>
        <button type="button" className={styles.quiet} aria-label="Previous month" onClick={() => step(-1)}>‹</button>
        <h2>{monthName} {month.y}</h2>
        <button type="button" className={styles.quiet} aria-label="Next month" onClick={() => step(1)}>›</button>
      </div>
      <div className={styles.calendar}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className={styles.calDay}>{d}</div>)}
        {cells.map((n, i) => {
          if (n < 1 || n > daysInMonth) return <div key={i} className={styles.outCell} aria-hidden="true" />;
          const date = new Date(month.y, month.m, n);
          const k = dayKey(date);
          const its = byDay.get(k) ?? [];
          const cls = [styles.cell, k === dayKey(today) ? styles.isToday : "", k === selected ? styles.isSelected : ""].join(" ");
          return (
            <button key={i} type="button" className={cls} aria-pressed={k === selected}
              aria-label={`${n} ${monthName}, ${its.length ? `${its.length} due` : "nothing due"}`} onClick={() => onSelect(k)}>
              <span className={styles.num}>{n}</span>
              {its.slice(0, 3).map((h) => (
                <span key={h.id} className={`${styles.ev} ${colourOf(h.course_id)} ${h.status !== "todo" ? styles.evDone : ""}`}>
                  <i aria-hidden="true" /><span>{h.title}</span>
                </span>
              ))}
              {its.length > 3 && <span className={styles.more}>{its.length - 3} more</span>}
            </button>
          );
        })}
      </div>
      <section className={styles.dayPanel} aria-label={longDay(selectedDate)} aria-live="polite">
        <h3>{longDay(selectedDate)}</h3>
        {selectedItems.length ? selectedItems.map(renderCard) : <p className={styles.empty}>Nothing is due on this day.</p>}
      </section>
    </div>
  );
}
