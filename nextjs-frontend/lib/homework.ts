export function formatDue(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** `<input type="datetime-local">` gives local wall-clock time; send it as a UTC instant. */
export function localInputToIso(value: string): string | null {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", opts);

/** YYYY-MM-DD in local time, for grouping homework by the day it is due. */
export const dayKey = (d: Date) => d.toLocaleDateString("en-CA");

/** "Due Fri 13 Nov, 23:59" */
export const dueText = (iso: string) =>
  `Due ${fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso))}, ${fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}`;
