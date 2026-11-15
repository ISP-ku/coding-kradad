import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityTask, CourseActivity } from "@/lib/types";
import ActivityWorkspace from "./ActivityWorkspace";

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();
let nextId = 1;

function activity(title: string, task: Partial<ActivityTask> = {}, days = 10): CourseActivity {
  return {
    id: nextId++,
    course_id: "01219245",
    title,
    type: "deadline",
    starts_at: inDays(days),
    location: "Online",
    created_by: "google:lecturer-1",
    tasks: [{
      id: nextId++,
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

function renderAs(activities: CourseActivity[], role: "ta" | "lecturer" = "ta") {
  render(<ActivityWorkspace initialActivities={activities} viewerRole={role} viewerId="google:ta-1" />);
}

const group = (name: string) => screen.getByRole("region", { name });

afterEach(() => vi.unstubAllGlobals());

describe("ActivityWorkspace groups (SRS-12, SRS-13)", () => {
  it("puts an overdue task under Overdue", () => {
    renderAs([activity("Grade Lab 3", { is_overdue: true }, -2)]);
    expect(within(group("Overdue")).getByText("Grade Lab 3")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Later" })).not.toBeInTheDocument();
  });

  it("puts a task due within 7 days under Next 7 days, with an At risk badge when it is at risk", () => {
    renderAs([activity("Prepare Lab 5", { is_at_risk: true }, 1)]);
    const soon = group("Next 7 days");
    expect(within(soon).getByText("Prepare Lab 5")).toBeInTheDocument();
    expect(within(soon).getByText("At risk")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Overdue" })).not.toBeInTheDocument();
  });

  it("puts a task that is on track and further away under Later, with no badge", () => {
    renderAs([activity("Midterm review", {}, 20)]);
    expect(within(group("Later")).getByText("Midterm review")).toBeInTheDocument();
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Overdue" })).not.toBeInTheDocument();
  });

  it("orders each group by date", () => {
    renderAs([activity("Later one", {}, 30), activity("Sooner one", {}, 12)]);
    const titles = within(group("Later")).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Sooner one", "Later one"]);
  });
});

describe("ActivityWorkspace for a TA", () => {
  const mine = activity("My task", {}, 3);
  const theirs = activity("Someone else's task", { assignee_id: "google:ta-2", assignee_name: "TA Two" }, 3);

  it("starts on My tasks and can show everyone's", () => {
    renderAs([mine, theirs]);
    expect(screen.getByRole("button", { name: "My tasks (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("My task")).toBeInTheDocument();
    expect(screen.queryByText("Someone else's task")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Everyone (2)" }));
    expect(screen.getByText("Someone else's task")).toBeInTheDocument();
  });

  it("can change only their own task's status", () => {
    renderAs([mine, theirs]);
    fireEvent.click(screen.getByRole("button", { name: "Everyone (2)" }));
    expect(screen.getByLabelText("Status of My task")).toBeEnabled();
    expect(screen.getByLabelText("Status of Someone else's task")).toBeDisabled();
  });

  it("marks a task done, removes it and says so", async () => {
    const a = activity("Finish slides", {}, 3);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...a.tasks[0], status: "Done" }), { status: 200 })));
    renderAs([a]);
    fireEvent.change(screen.getByLabelText("Status of Finish slides"), { target: { value: "Done" } });
    await waitFor(() => expect(screen.queryByText("Finish slides")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Marked done: Finish slides");
  });

  it("explains an empty list", () => {
    renderAs([]);
    expect(screen.getByText(/Nothing is due/)).toBeInTheDocument();
  });
});

describe("ActivityWorkspace for a lecturer", () => {
  it("shows every task with its TA and the activity actions", () => {
    renderAs([activity("Lab 3 setup", { assignee_id: "google:ta-2", assignee_name: "TA Two" }, 3)], "lecturer");
    expect(screen.queryByRole("button", { name: /My tasks/ })).not.toBeInTheDocument();
    expect(screen.getByText("TA Two")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Lab 3 setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive Lab 3 setup" })).toBeInTheDocument();
    expect(screen.getByLabelText("Status of Lab 3 setup")).toBeEnabled();
  });
});
