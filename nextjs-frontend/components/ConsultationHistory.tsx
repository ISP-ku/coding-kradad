import { formatDuration, formatSessionDate, sortNewestFirst } from "@/lib/consultations";
import type { Consultation } from "@/lib/types";
import styles from "./ConsultationLog.module.css";

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
            <span>{formatSessionDate(c.session_date)}</span>
            <span className={`${styles.chip} ${styles.chipDuration}`}>{formatDuration(c.duration_minutes)}</span>
            <span className={styles.chip}>{c.participants}</span>
          </div>
        </div>
      ))}
    </>
  );
}
