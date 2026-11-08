import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeworkStudent from "./HomeworkStudent";
import type { HomeworkItem } from "@/lib/types";

const hw = (over: Partial<HomeworkItem>): HomeworkItem => ({
  id: 1, course_id: "01219245", title: "HW1", description: "", due_at: "2099-01-01T02:00:00Z",
  max_score: 20, created_at: "2026-10-01T00:00:00Z", status: "todo", is_overdue: false,
  my_submission: null, submission_count: null, graded_count: null, ...over,
});
const sub = (over = {}) => ({
  id: 7, homework_id: 2, student_name: "Me", answer: "my answer", submitted_at: "2026-10-02T00:00:00Z",
  is_late: false, score: null, feedback: null, graded_at: null, ...over,
});
const ITEMS = [
  hw({ id: 1, title: "HW1 todo" }),
  hw({ id: 2, title: "HW2 submitted", status: "submitted", my_submission: sub() }),
  hw({ id: 3, title: "HW3 graded", status: "graded", my_submission: sub({ id: 8, homework_id: 3, score: 18, feedback: "Nice work" }) }),
  hw({ id: 4, title: "HW0 overdue", status: "todo", is_overdue: true }),
];

afterEach(() => vi.unstubAllGlobals());

describe("HomeworkStudent", () => {
  it("opens on To do and shows only homework that is left", () => {
    render(<HomeworkStudent initial={ITEMS} />);
    expect(screen.getByRole("button", { name: "To do (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("HW1 todo")).toBeInTheDocument();
    expect(screen.getByText("HW0 overdue")).toBeInTheDocument();
    expect(screen.queryByText("HW2 submitted")).not.toBeInTheDocument();
    expect(screen.queryByText("HW3 graded")).not.toBeInTheDocument();
  });

  it("filters between To do, Submitted, Graded and All with correct counts", () => {
    render(<HomeworkStudent initial={ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: "Submitted (1)" }));
    expect(screen.getByText("HW2 submitted")).toBeInTheDocument();
    expect(screen.queryByText("HW1 todo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Graded (1)" }));
    expect(screen.getByText("HW3 graded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All (4)" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });

  it("flags overdue work that has not been handed in", () => {
    render(<HomeworkStudent initial={ITEMS} />);
    expect(within(screen.getByRole("article", { name: "HW0 overdue" })).getByText("Overdue")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "HW1 todo" })).queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("shows the score and TA feedback on graded work and offers no way to change it", () => {
    render(<HomeworkStudent initial={ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: "Graded (1)" }));
    const card = screen.getByRole("article", { name: "HW3 graded" });
    expect(within(card).getByText("Graded: 18 / 20")).toBeInTheDocument();
    expect(within(card).getByText(/Nice work/)).toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks for an answer before sending", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<HomeworkStudent initial={ITEMS} />);
    fireEvent.click(within(screen.getByRole("article", { name: "HW1 todo" })).getByRole("button", { name: "Submit homework" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/write your answer/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("submits, then moves the homework out of To do into Submitted", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(sub({ id: 9, homework_id: 1, answer: "https://my.link" })), { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    render(<HomeworkStudent initial={ITEMS} />);
    fireEvent.click(within(screen.getByRole("article", { name: "HW1 todo" })).getByRole("button", { name: "Submit homework" }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "  https://my.link  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "To do (1)" })).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/homework/1/submissions", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ answer: "https://my.link" });
    expect(screen.getByRole("button", { name: "Submitted (2)" })).toBeInTheDocument();
    expect(screen.queryByText("HW1 todo")).not.toBeInTheDocument();
    // The card has left To do, so the confirmation must live outside it.
    expect(screen.getByRole("status")).toHaveTextContent('"HW1 todo" was submitted');
    fireEvent.click(screen.getByRole("button", { name: "View submitted" }));
    expect(screen.getByText("HW1 todo")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lets a student edit a submission that is not graded yet, prefilled", () => {
    render(<HomeworkStudent initial={ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: "Submitted (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit submission" }));
    expect(screen.getByLabelText("Your answer")).toHaveValue("my answer");
  });

  it("shows the server's reason when a submission is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "This homework has already been graded and can no longer be changed." }), { status: 409 })));
    render(<HomeworkStudent initial={ITEMS} />);
    fireEvent.click(within(screen.getByRole("article", { name: "HW1 todo" })).getByRole("button", { name: "Submit homework" }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already been graded");
    expect(screen.getByLabelText("Your answer")).toHaveValue("x");   // nothing lost
  });

  it("tells the student when everything is done", () => {
    render(<HomeworkStudent initial={[ITEMS[1], ITEMS[2]]} />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });
});
