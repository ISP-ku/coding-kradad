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
