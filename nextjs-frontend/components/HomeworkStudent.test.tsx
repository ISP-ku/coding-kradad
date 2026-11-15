import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeworkStudent from "./HomeworkStudent";
import type { HomeworkItem } from "@/lib/types";

// "Today" for every test: Friday 13 November 2026, 10:00 local time.
const TODAY = new Date(2026, 10, 13, 10, 0);
const due = (day: number, month = 10) => new Date(2026, month, day, 23, 59).toISOString();

const hw = (over: Partial<HomeworkItem>): HomeworkItem => ({
  id: 1, course_id: "01219245", title: "HW1", description: "", due_at: due(20),
  max_score: 20, created_at: "2026-10-01T00:00:00Z", status: "todo", is_overdue: false,
  my_submission: null, submission_count: null, graded_count: null, ...over,
});
const sub = (over = {}) => ({
  id: 7, homework_id: 2, student_name: "Me", answer: "my answer", submitted_at: "2026-11-02T00:00:00Z",
  is_late: false, score: null, feedback: null, graded_at: null, ...over,
});
const ITEMS = [
  hw({ id: 1, title: "HW1 todo", due_at: due(16) }),
  hw({ id: 2, title: "HW2 submitted", status: "submitted", my_submission: sub(), due_at: due(11) }),
  hw({ id: 3, title: "HW3 graded", status: "graded", due_at: due(3), my_submission: sub({ id: 8, homework_id: 3, score: 18, feedback: "Nice work" }) }),
  hw({ id: 4, title: "HW0 overdue", is_overdue: true, due_at: due(10) }),
  hw({ id: 5, title: "Lab 6", course_id: "01219243", due_at: due(13) }),
  hw({ id: 6, title: "Project", course_id: "01219243", due_at: due(30) }),
];

const show = (items = ITEMS) => render(<HomeworkStudent initial={items} today={TODAY} />);
const group = (name: string) => screen.getByRole("region", { name });

afterEach(() => vi.unstubAllGlobals());

describe("HomeworkStudent to-do list", () => {
  it("groups homework by urgency, with handed-in work last", () => {
    show();
    expect(within(group("Overdue")).getByText("HW0 overdue")).toBeInTheDocument();
    expect(within(group("Due today")).getByText("Lab 6")).toBeInTheDocument();
    expect(within(group("Next 7 days")).getByText("HW1 todo")).toBeInTheDocument();
    expect(within(group("Later")).getByText("Project")).toBeInTheDocument();
    const done = group("Handed in and graded");
    expect(within(done).getByText("HW2 submitted")).toBeInTheDocument();
    expect(within(done).getByText("HW3 graded")).toBeInTheDocument();
  });

  it("says how much is left in the summary", () => {
    show();
    expect(screen.getByText("4 to hand in, 1 of them overdue.")).toBeInTheDocument();
  });

  it("filters by course, with a count of what is left in each", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "01219243 2 left" }));
    expect(screen.getByText("Lab 6")).toBeInTheDocument();
    expect(screen.queryByText("HW1 todo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All courses 4 left" }));
    expect(screen.getByText("HW1 todo")).toBeInTheDocument();
  });

  it("offers Hand in late on overdue work", () => {
    show();
    expect(within(screen.getByRole("article", { name: "HW0 overdue" })).getByRole("button", { name: "Hand in late" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "HW1 todo" })).getByRole("button", { name: "Hand in" })).toBeInTheDocument();
  });

  it("shows the score and TA feedback on graded work and offers no way to change it", () => {
    show();
    const card = screen.getByRole("article", { name: "HW3 graded" });
    expect(within(card).getByText("Graded 18 / 20")).toBeInTheDocument();
    expect(within(card).getByText(/Nice work/)).toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks for an answer before sending", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    show();
    fireEvent.click(within(screen.getByRole("article", { name: "HW1 todo" })).getByRole("button", { name: "Hand in" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/write your answer/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("hands in, then moves the homework to Handed in and graded", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(sub({ id: 9, homework_id: 1, answer: "https://my.link" })), { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    show();
    fireEvent.click(within(screen.getByRole("article", { name: "HW1 todo" })).getByRole("button", { name: "Hand in" }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "  https://my.link  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(within(group("Handed in and graded")).getByText("HW1 todo")).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/homework/1/submissions", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ answer: "https://my.link" });
    expect(screen.queryByRole("region", { name: "Next 7 days" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent('"HW1 todo" was handed in');
  });

  it("lets a student edit a submission that is not graded yet, prefilled", () => {
    show();
    fireEvent.click(within(screen.getByRole("article", { name: "HW2 submitted" })).getByRole("button", { name: "Edit submission" }));
    expect(screen.getByLabelText("Your answer")).toHaveValue("my answer");
  });

  it("shows the server's reason when a submission is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "This homework has already been graded and can no longer be changed." }), { status: 409 })));
    show();
    fireEvent.click(within(screen.getByRole("article", { name: "HW1 todo" })).getByRole("button", { name: "Hand in" }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already been graded");
    expect(screen.getByLabelText("Your answer")).toHaveValue("x");
  });

  it("tells the student when everything is handed in", () => {
    show([ITEMS[1], ITEMS[2]]);
    expect(screen.getByText("Everything is handed in.")).toBeInTheDocument();
  });

  it("explains when nothing has been assigned", () => {
    show([]);
    expect(screen.getByText(/No homework yet/)).toBeInTheDocument();
  });
});

describe("HomeworkStudent calendar", () => {
  it("puts homework on its due date and lists the selected day", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    const day16 = screen.getByRole("button", { name: "16 November, 1 due" });
    expect(within(day16).getByText("HW1 todo")).toBeInTheDocument();
    // Today is selected first.
    expect(screen.getByRole("region", { name: "Friday 13 November" })).toHaveTextContent("Lab 6");
    fireEvent.click(day16);
    expect(within(screen.getByRole("region", { name: "Monday 16 November" })).getByRole("article", { name: "HW1 todo" })).toBeInTheDocument();
  });

  it("moves between months", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });
});

describe("HomeworkStudent by course", () => {
  it("shows one section per course with what is left", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "By course" }));
    const db = screen.getByRole("region", { name: "01219243" });
    expect(within(db).getByText("2 to hand in")).toBeInTheDocument();
    expect(within(db).getByText("Lab 6")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "01219245" })).getByText("Missing")).toBeInTheDocument();
  });

  it("opens a homework in the list with its answer box", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "By course" }));
    fireEvent.click(within(screen.getByRole("region", { name: "01219243" })).getByRole("button", { name: "Open Lab 6" }));
    expect(screen.getByRole("button", { name: "To-do list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });
});
