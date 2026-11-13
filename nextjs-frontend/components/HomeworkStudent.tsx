"use client";

import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/homework";
import type { HomeworkItem, HomeworkSubmission } from "@/lib/types";
import Icon from "./Icon";
import styles from "./HomeworkStudent.module.css";

type View = "list" | "calendar" | "course";
type Bucket = "overdue" | "today" | "soon" | "later" | "done";

const DAY = 24 * 60 * 60 * 1000;
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "soon", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "done", label: "Handed in and graded" },
];
const VIEWS: { key: View; label: string; icon: "list" | "calendar" | "columns" }[] = [
  { key: "list", label: "To-do list", icon: "list" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "course", label: "By course", icon: "columns" },
];
const COURSE_COLOURS = ["c1", "c2", "c3", "c4"] as const;

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", opts);
const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const dueText = (iso: string) =>
  `Due ${fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso))}, ${fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}`;
const longDay = (d: Date) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(d);

/**
 * Student homework: split by course, shown as a to-do list grouped by
 * urgency, a month calendar, or one section per course. Every view hands
 * work in through the same card.
 */
export default function HomeworkStudent({ initial, today: todayProp }: { initial: HomeworkItem[]; today?: Date }) {
  const today = useMemo(() => todayProp ?? new Date(), [todayProp]);
  const [items, setItems] = useState(initial);
  const [view, setView] = useState<View>("list");
  const [course, setCourse] = useState<string>("all");
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(dayKey(today));
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const courses = useMemo(() => Array.from(new Set(items.map((h) => h.course_id))).sort(), [items]);
  const colourOf = (code: string) => styles[COURSE_COLOURS[courses.indexOf(code) % COURSE_COLOURS.length]];
  const todoIn = (code: string) => items.filter((h) => h.status === "todo" && (code === "all" || h.course_id === code)).length;
  const shown = items.filter((h) => course === "all" || h.course_id === course);

  function bucketOf(h: HomeworkItem): Bucket {
    if (h.status !== "todo") return "done";
    if (h.is_overdue) return "overdue";
    const d = new Date(h.due_at);
    if (dayKey(d) === dayKey(today)) return "today";
    return d.getTime() <= today.getTime() + 7 * DAY ? "soon" : "later";
  }

  const todo = shown.filter((h) => h.status === "todo");
  const overdue = todo.filter((h) => h.is_overdue).length;
  const summary = !items.length
    ? "No homework yet. It appears here as soon as your lecturer assigns it."
    : todo.length === 0
      ? "Everything is handed in."
      : `${todo.length} to hand in${overdue ? `, ${overdue} of them overdue.` : "."}`;

  function open(item: HomeworkItem) {
    setOpenId(item.id);
    setDraft(item.my_submission?.answer ?? "");
    setError(null);
    setNotice(null);
  }

  async function send(e: React.FormEvent, item: HomeworkItem) {
    e.preventDefault();
    if (!draft.trim()) {
      setError({ id: item.id, message: "Please write your answer or paste a link first." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/homework/${item.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: draft.trim() }),
      });
      if (!res.ok) {
        setError({ id: item.id, message: await errorMessage(res, "Could not hand this in right now. Please try again.") });
        return;
      }
      const saved = (await res.json()) as HomeworkSubmission;
      setItems((list) => list.map((h) => (h.id === item.id ? { ...h, status: "submitted", is_overdue: false, my_submission: saved } : h)));
      setOpenId(null);
      setNotice(`"${item.title}" was handed in. You can change it until it is graded.`);
    } catch {
      setError({ id: item.id, message: "Could not reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const card = (h: HomeworkItem) => {
    const bucket = bucketOf(h);
    const sub = h.my_submission;
    const graded = h.status === "graded";
    const due = new Date(h.due_at);
    return (
      <article className={`${styles.card} ${styles[bucket]}`} key={h.id} aria-label={h.title}>
        <div className={styles.cardMain}>
          <div className={styles.day}>
            {fmt({ day: "numeric" }).format(due)}
            <span>{fmt({ weekday: "short" }).format(due)}</span>
          </div>
          <div className={styles.info}>
            <h3>{h.title}</h3>
            <div className={styles.meta}>
              <span className={`${styles.tag} ${colourOf(h.course_id)}`}><i aria-hidden="true" />{h.course_id}</span>
              <span>{dueText(h.due_at)}</span>
              <span>{h.max_score} points</span>
            </div>
          </div>
          <div className={styles.act}>
            {graded && sub ? (
              <span className={styles.graded}>Graded {sub.score} / {h.max_score}</span>
            ) : h.status === "submitted" ? (
              <>
                <span className={styles.handed}>Handed in</span>
                {openId !== h.id && <button type="button" className={styles.quiet} onClick={() => open(h)}>Edit submission</button>}
              </>
            ) : (
              openId !== h.id && (
                <button type="button" className={styles.btn} onClick={() => open(h)}>
                  {h.is_overdue ? "Hand in late" : "Hand in"}
                </button>
              )
            )}
          </div>
        </div>

        {h.description && <p className={styles.desc}>{h.description}</p>}

        {sub && openId !== h.id && (
          <div className={styles.answerBox}>
            <span className={styles.answerLabel}>
              Your answer{sub.is_late && <span className={styles.late}>Handed in late</span>}
            </span>
            <div className={styles.answer}>{sub.answer}</div>
            {graded && sub.feedback && <p className={styles.feedback}><strong>TA feedback:</strong> {sub.feedback}</p>}
          </div>
        )}

        {openId === h.id && (
          <form className={styles.form} onSubmit={(e) => send(e, h)} noValidate>
            <label htmlFor={`answer-${h.id}`}>Your answer</label>
            <textarea
              id={`answer-${h.id}`}
              value={draft}
              maxLength={5000}
              placeholder="Type your answer, or paste a link to your work"
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={error?.id === h.id ? true : undefined}
            />
            {error?.id === h.id && <div className={styles.alert} role="alert">{error.message}</div>}
            <div className={styles.formActions}>
              <button type="submit" className={styles.btn} disabled={busy}>{busy ? "Sending..." : "Send"}</button>
              <button type="button" className={styles.quiet} onClick={() => setOpenId(null)}>Cancel</button>
            </div>
          </form>
        )}
      </article>
    );
  };

  // ---- views -------------------------------------------------------------

  const listView = () => {
    const groups = BUCKETS.map((b) => {
      const rows = shown.filter((h) => bucketOf(h) === b.key);
      rows.sort((a, c) => (b.key === "done" ? c.due_at.localeCompare(a.due_at) : a.due_at.localeCompare(c.due_at)));
      return { ...b, rows };
    }).filter((g) => g.rows.length);
    return (
      <div className={styles.list}>
        {groups.map((g) => (
          <section key={g.key} className={`${styles.group} ${styles[g.key]}`} aria-labelledby={`hw-${g.key}`}>
            <span className={styles.dot} aria-hidden="true" />
            <h2 id={`hw-${g.key}`} className={styles.groupLabel}>{g.label}</h2>
            {g.rows.map(card)}
          </section>
        ))}
      </div>
    );
  };

  const calendarView = () => {
    const first = new Date(month.y, month.m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
    const cells = Array.from({ length: 42 }, (_, i) => i - offset + 1);
    const byDay = new Map<string, HomeworkItem[]>();
    for (const h of shown) {
      const k = dayKey(new Date(h.due_at));
      byDay.set(k, [...(byDay.get(k) ?? []), h]);
    }
    const monthName = fmt({ month: "long" }).format(first);
    const selectedDate = new Date(`${selected}T12:00:00`);
    const selectedItems = byDay.get(selected) ?? [];
    const step = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
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
                aria-label={`${n} ${monthName}, ${its.length ? `${its.length} due` : "nothing due"}`} onClick={() => setSelected(k)}>
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
          {selectedItems.length ? selectedItems.map(card) : <p className={styles.empty}>Nothing is due on this day.</p>}
        </section>
      </div>
    );
  };

  const courseView = () => (
    <div className={styles.board}>
      {(course === "all" ? courses : [course]).map((code) => {
        const posts = items.filter((h) => h.course_id === code).sort((a, b) => b.due_at.localeCompare(a.due_at));
        const left = todoIn(code);
        return (
          <section key={code} className={`${styles.courseCard} ${colourOf(code)}`} aria-label={code}>
            <div className={styles.band}>
              <strong>{code}</strong>
              <span>{left ? `${left} to hand in` : "All handed in"}</span>
            </div>
            {posts.map((h) => {
              const sub = h.my_submission;
              const state = h.status === "graded" && sub ? `Graded ${sub.score} / ${h.max_score}`
                : h.status === "submitted" ? "Handed in" : h.is_overdue ? "Missing" : "Assigned";
              const stateCls = h.status === "graded" ? styles.graded : h.is_overdue && h.status === "todo" ? styles.missing : styles.handed;
              return (
                <div className={styles.post} key={h.id}>
                  <div className={styles.postTop}>
                    <span className={styles.postTitle}>{h.title}</span>
                    <span className={stateCls}>{state}</span>
                  </div>
                  <span className={styles.postDue}>{dueText(h.due_at)}</span>
                  {h.status !== "graded" && (
                    <button type="button" className={styles.quiet} aria-label={`Open ${h.title}`}
                      onClick={() => { setView("list"); setCourse(code); open(h); }}>
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

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <p className={styles.summary}>{summary}</p>
        <div className={styles.views} role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)}>
              <Icon name={v.icon} />{v.label}
            </button>
          ))}
        </div>
      </div>

      {courses.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Course">
          {["all", ...courses].map((code) => {
            const n = todoIn(code);
            return (
              <button key={code} type="button" className={`${styles.chip} ${code === "all" ? "" : colourOf(code)}`}
                aria-pressed={course === code} onClick={() => setCourse(code)}>
                {code !== "all" && <i aria-hidden="true" />}
                {code === "all" ? "All courses" : code}
                {n > 0 && <>{" "}<span className={styles.count}>{n} left</span></>}
              </button>
            );
          })}
        </div>
      )}

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      {view === "list" && listView()}
      {view === "calendar" && calendarView()}
      {view === "course" && courseView()}
    </div>
  );
}
