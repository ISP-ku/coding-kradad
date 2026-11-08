import type { Consultation } from "@/lib/types";
import styles from "./ConsultationLog.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Newest session first (SRS-15); ties broken by id.
export const sortNewestFirst = (list: Consultation[]) =>
  [...list].sort((a, b) =>
    a.session_date === b.session_date ? b.id - a.id : a.session_date < b.session_date ? 1 : -1,
  );

export default function ConsultationHistory({ entries }: { entries: Consultation[] }) {
  const sorted = sortNewestFirst(entries);
  if (sorted.length === 0) {
    return <p className={styles.empty}>No consultations recorded yet. Your first one will show up here.</p>;
  }
  return (
    <>
      {sorted.map((c) => (
        <div className={styles.card} key={c.id}>
          <div className={styles.topic}>{c.topic}</div>
          <div className={styles.meta}>
            <span>{formatDate(c.session_date)}</span>
            <span className={`${styles.chip} ${styles.chipDuration}`}>{formatDuration(c.duration_minutes)}</span>
            <span className={styles.chip}>{c.participants}</span>
          </div>
        </div>
      ))}
    </>
  );
}
