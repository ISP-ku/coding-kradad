import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WaitingPanel, { waitingItems } from "./WaitingPanel";
import type { HomeworkItem, Topic } from "@/lib/types";

const hw = (over: Partial<HomeworkItem>): HomeworkItem => ({
  id: 1, course_id: "01219245", title: "HW1", description: "", due_at: "2099-01-01T02:00:00Z",
  max_score: 20, created_at: "2026-10-01T00:00:00Z", status: null, is_overdue: false,
  my_submission: null, submission_count: 0, graded_count: 0, ...over,
});
const topic = (id: number): Topic => ({
  id, title: `Q${id}`, description: "", status: "Pending", submitted_by: "x", created_at: "2026-11-10T00:00:00Z",
  comment_count: 0, saved: false,
});

describe("waitingItems", () => {
  it("gives a TA the homework that still has ungraded submissions", () => {
    const items = waitingItems("ta", [hw({ id: 1, title: "HW3", submission_count: 7, graded_count: 0 }), hw({ id: 2, title: "HW2", submission_count: 3, graded_count: 3 })], []);
    expect(items).toEqual([{ title: "HW3", detail: "7 submissions to grade", href: "/homework", action: "Grade" }]);
  });

  it("gives a lecturer FAQ topics to approve and homework progress", () => {
    const items = waitingItems("lecturer", [hw({ title: "HW3", submission_count: 31, graded_count: 7 })], [topic(1), topic(2)]);
    expect(items[0]).toEqual({ title: "2 FAQ topics to approve", detail: "They stay hidden until you review them.", href: "/faq", action: "Review" });
    expect(items[1]).toEqual({ title: "HW3", detail: "31 handed in, 7 graded", href: "/homework", action: "View" });
  });

  it("uses the singular for one item", () => {
    expect(waitingItems("ta", [hw({ submission_count: 1 })], [])[0].detail).toBe("1 submission to grade");
    expect(waitingItems("lecturer", [], [topic(1)])[0].title).toBe("1 FAQ topic to approve");
  });
});

describe("WaitingPanel", () => {
  it("lists each item with its action link", () => {
    render(<WaitingPanel items={[{ title: "HW3", detail: "7 submissions to grade", href: "/homework", action: "Grade" }]} />);
    expect(screen.getByRole("heading", { name: "Waiting for you" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grade HW3" })).toHaveAttribute("href", "/homework");
  });

  it("says when nothing is waiting", () => {
    render(<WaitingPanel items={[]} />);
    expect(screen.getByText("Nothing is waiting for you.")).toBeInTheDocument();
  });
});
