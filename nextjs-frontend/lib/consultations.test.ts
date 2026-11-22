import { describe, expect, it } from "vitest";
import { formatDuration, formatSessionDate, historySummary, sortNewestFirst } from "./consultations";
import type { Consultation } from "./types";

const entry = (id: number, session_date: string, duration_minutes = 40): Consultation => ({
  id, session_date, duration_minutes, topic: "T", participants: "P", created_at: "2026-11-01T03:00:00Z",
});

describe("consultation helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(70)).toBe("1 h 10 min");
  });

  it("formats a session date without shifting the day", () => {
    expect(formatSessionDate("2026-11-03")).toBe("3 Nov 2026");
    expect(formatSessionDate("2026-01-31")).toBe("31 Jan 2026");
  });

  it("sorts newest first, newer id first on the same day, without changing the input", () => {
    const list = [entry(1, "2026-10-02"), entry(3, "2026-11-03"), entry(2, "2026-11-03")];
    expect(sortNewestFirst(list).map((e) => e.id)).toEqual([3, 2, 1]);
    expect(list.map((e) => e.id)).toEqual([1, 3, 2]);
  });

  it("summarises the history", () => {
    expect(historySummary([entry(1, "2026-10-02", 45)])).toBe("1 session, 45 min in total");
    expect(historySummary([entry(1, "2026-10-02", 45), entry(2, "2026-10-03", 90)])).toBe("2 sessions, 2 h 15 min in total");
  });
});
