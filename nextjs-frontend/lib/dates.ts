// Local-time date helpers shared by the forms. Inputs of type date, time and
// datetime-local want these exact formats, in the user's own time zone.

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in local time. */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** YYYY-MM-DDTHH:MM in local time, for datetime-local inputs. */
export const localDateTime = (d: Date) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The date `n` days after `from` (negative for days before). */
export const daysFromNow = (n: number, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return d;
};
