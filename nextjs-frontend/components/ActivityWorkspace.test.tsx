import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityTask, CourseActivity } from "@/lib/types";
import ActivityWorkspace from "./ActivityWorkspace";

function activity(title: string, task: Partial<ActivityTask>): CourseActivity {
  return {
    id: Math.floor(Math.random() * 10000),
    course_id: "01219245",
    title,
    type: "deadline",
    starts_at: "2026-10-20T09:00:00",
    location: "Online",
    created_by: "google:lecturer-1",
    tasks: [{
      id: Math.floor(Math.random() * 10000),
      assignee_id: "google:ta-1",
      assignee_name: "TA One",
      status: "Not Started",
      assigned_at: "2026-10-01T09:00:00",
      status_changed_at: null,
      is_overdue: false,
      is_at_risk: false,
      ...task,
    }],
  };
}

function renderWith(activities: CourseActivity[]) {
  render(<ActivityWorkspace initialActivities={activities} viewerRole="ta" viewerId="google:ta-1" />);
}

describe("ActivityWorkspace flags (SRS-12, SRS-13)", () => {
  it("shows an Overdue badge on an overdue task", () => {
    renderWith([activity("Grade Lab 3", { is_overdue: true })]);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
  });

  it("shows an At risk badge on a task due soon", () => {
    renderWith([activity("Prepare Lab 5", { is_at_risk: true })]);
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("shows no badge on a task that is on track", () => {
    renderWith([activity("Midterm review", {})]);
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
  });
});
