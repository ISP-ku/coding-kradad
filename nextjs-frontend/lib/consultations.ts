import type { Consultation } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-03" -> "3 Nov 2026". Parsed by hand so the day never shifts with the time zone. */
export function formatSessionDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 45 -> "45 min", 60 -> "1 h", 70 -> "1 h 10 min". */
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

/** "3 sessions, 2 h 15 min in total" */
export function historySummary(entries: Consultation[]) {
  const minutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  return `${entries.length} ${entries.length === 1 ? "session" : "sessions"}, ${formatDuration(minutes)} in total`;
}
