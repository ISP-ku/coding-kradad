import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Consultation } from "@/lib/types";
import ConsultationHistory, { formatDuration } from "./ConsultationHistory";

const entry = (id: number, session_date: string, topic: string): Consultation => ({
  id, session_date, topic, duration_minutes: 40, participants: "Group 2", created_at: "2026-11-01T03:00:00Z",
});

describe("ConsultationHistory", () => {
  it("lists sessions newest first (SRS-15)", () => {
    render(<ConsultationHistory entries={[entry(1, "2026-10-02", "Older"), entry(2, "2026-11-03", "Newer")]} />);
    const topics = screen.getAllByText(/Older|Newer/).map((el) => el.textContent);
    expect(topics).toEqual(["Newer", "Older"]);
  });

  it("shows an empty state", () => {
    render(<ConsultationHistory entries={[]} />);
    expect(screen.getByText(/No consultations recorded yet/)).toBeInTheDocument();
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(70)).toBe("1 h 10 min");
  });
});
