import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeworkStaff from "./HomeworkStaff";
import type { HomeworkItem } from "@/lib/types";

const hw = (over: Partial<HomeworkItem>): HomeworkItem => ({
  id: 1, course_id: "01219245", title: "HW1", description: "", due_at: "2099-01-01T02:00:00Z",
  max_score: 20, created_at: "2026-10-01T00:00:00Z", status: null, is_overdue: false,
  my_submission: null, submission_count: 0, graded_count: 0, ...over,
});
const sub = (over = {}) => ({
  id: 7, homework_id: 1, student_name: "Alice", answer: "alice answer", submitted_at: "2026-10-02T00:00:00Z",
  is_late: false, score: null, feedback: null, graded_at: null, ...over,
});
const ITEMS = [
  hw({ id: 1, title: "HW1 needs grading", submission_count: 2, graded_count: 1 }),
  hw({ id: 2, title: "HW2 all graded", submission_count: 1, graded_count: 1 }),
  hw({ id: 3, title: "HW3 no work yet" }),
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("HomeworkStaff as a TA", () => {
  it("opens on 'Needs grading' and hides finished homework", () => {
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    expect(screen.getByRole("button", { name: "Needs grading (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("HW1 needs grading")).toBeInTheDocument();
    expect(screen.queryByText("HW2 all graded")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All (3)" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("has no assign form", () => {
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    expect(screen.queryByRole("form", { name: "Assign homework" })).not.toBeInTheDocument();
  });

  it("loads submissions and saves a grade, updating the graded count", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json([sub(), sub({ id: 8, student_name: "Bob", score: 12 })]))
      .mockResolvedValueOnce(json(sub({ score: 17, feedback: "Good", graded_at: "2026-10-03T00:00:00Z" })));
    vi.stubGlobal("fetch", fetcher);
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));

    const alice = await screen.findByRole("group", { name: "Submission from Alice" });
    expect(within(alice).getByText("alice answer")).toBeInTheDocument();
    fireEvent.change(within(alice).getByLabelText("Score (max 20)"), { target: { value: "17" } });
    fireEvent.change(within(alice).getByLabelText("Feedback (optional)"), { target: { value: "Good" } });
    fireEvent.click(within(alice).getByRole("button", { name: "Save grade" }));

    expect(await within(alice).findByRole("status")).toHaveTextContent("Grade saved");
    expect(fetcher).toHaveBeenLastCalledWith("/api/homework/1/submissions/7", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ score: 17, feedback: "Good" });
    expect(screen.getByText("2 submitted · 2 graded")).toBeInTheDocument();   // Alice newly graded
  });

  it("keeps the homework on screen after its last submission is graded, until it is closed", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([sub()]))
      .mockResolvedValueOnce(json(sub({ score: 20 }))));
    render(<HomeworkStaff initial={[hw({ id: 1, title: "Last one", submission_count: 1, graded_count: 0 })]} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));
    const alice = await screen.findByRole("group", { name: "Submission from Alice" });
    fireEvent.change(within(alice).getByLabelText("Score (max 20)"), { target: { value: "20" } });
    fireEvent.click(within(alice).getByRole("button", { name: "Save grade" }));
    await within(alice).findByRole("status");
    expect(screen.getByText("Last one")).toBeInTheDocument();          // still there
    expect(screen.getByRole("button", { name: "Needs grading (0)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide submissions" }));
    expect(screen.queryByText("Last one")).not.toBeInTheDocument();    // gone once closed
    expect(screen.getByText("Nothing is waiting to be graded.")).toBeInTheDocument();
  });

  it("regrading an already-graded submission does not double count", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([sub({ id: 8, student_name: "Bob", score: 12 })]))
      .mockResolvedValueOnce(json(sub({ id: 8, student_name: "Bob", score: 15 }))));
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));
    const bob = await screen.findByRole("group", { name: "Submission from Bob" });
    expect(within(bob).getByLabelText("Score (max 20)")).toHaveValue(12);
    fireEvent.change(within(bob).getByLabelText("Score (max 20)"), { target: { value: "15" } });
    fireEvent.click(within(bob).getByRole("button", { name: "Update grade" }));
    await within(bob).findByRole("status");
    expect(screen.getByText("2 submitted · 1 graded")).toBeInTheDocument();
  });

  it.each(["", "21", "-1", "7.5"])("rejects the score %j without calling the server", async (value) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([sub()]));
    vi.stubGlobal("fetch", fetcher);
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));
    const alice = await screen.findByRole("group", { name: "Submission from Alice" });
    fireEvent.change(within(alice).getByLabelText("Score (max 20)"), { target: { value } });
    fireEvent.click(within(alice).getByRole("button", { name: "Save grade" }));
    expect(within(alice).getByRole("alert")).toHaveTextContent("whole-number score from 0 to 20");
    expect(fetcher).toHaveBeenCalledTimes(1);   // only the initial load
  });

  it("clears the score error as soon as the TA corrects the value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([sub()])));
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));
    const alice = await screen.findByRole("group", { name: "Submission from Alice" });
    fireEvent.change(within(alice).getByLabelText("Score (max 20)"), { target: { value: "99" } });
    fireEvent.click(within(alice).getByRole("button", { name: "Save grade" }));
    expect(within(alice).getByRole("alert")).toBeInTheDocument();
    fireEvent.change(within(alice).getByLabelText("Score (max 20)"), { target: { value: "18" } });
    expect(within(alice).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the server's message when grading fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([sub()]))
      .mockResolvedValueOnce(json({ detail: "Score cannot be more than 20." }, 422)));
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));
    const alice = await screen.findByRole("group", { name: "Submission from Alice" });
    fireEvent.change(within(alice).getByLabelText("Score (max 20)"), { target: { value: "20" } });
    fireEvent.click(within(alice).getByRole("button", { name: "Save grade" }));
    expect(await within(alice).findByRole("alert")).toHaveTextContent("Score cannot be more than 20.");
  });

  it("explains an empty submission list and a load failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([])));
    const { unmount } = render(<HomeworkStaff initial={ITEMS} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));
    expect(await screen.findByText(/No one has submitted/)).toBeInTheDocument();
    unmount();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ detail: "Homework not found." }, 404)));
    render(<HomeworkStaff initial={ITEMS} role="ta" />);
    fireEvent.click(screen.getByRole("button", { name: "Review & grade" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Homework not found.");
  });
});

describe("HomeworkStaff as a lecturer", () => {
  it("can read submissions but has no grading controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([sub(), sub({ id: 8, student_name: "Bob", score: 12, feedback: "ok" })])));
    render(<HomeworkStaff initial={ITEMS} role="lecturer" />);
    fireEvent.click(within(screen.getByRole("article", { name: "HW1 needs grading" })).getByRole("button", { name: "View submissions" }));
    await screen.findByRole("group", { name: "Submission from Alice" });
    expect(screen.queryByLabelText(/Score/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /grade/i })).not.toBeInTheDocument();
    expect(screen.getByText("Graded: 12 / 20")).toBeInTheDocument();
  });

  it("shows every homework by default, not just the ones to grade", () => {
    render(<HomeworkStaff initial={ITEMS} role="lecturer" />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("validates the assign form before sending", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<HomeworkStaff initial={[]} role="lecturer" />);
    fireEvent.change(screen.getByLabelText("Maximum score"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign homework" }));
    expect(screen.getByText("Please enter the course code.")).toBeInTheDocument();
    expect(screen.getByText("Please enter a title.")).toBeInTheDocument();
    expect(screen.getByText("Please pick the due date and time.")).toBeInTheDocument();
    expect(screen.getByText("Enter a whole number from 1 to 1000.")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("assigns homework and shows it in the list straight away", async () => {
    const created = hw({ id: 9, title: "HW9 New", submission_count: 0, graded_count: 0, max_score: 50 });
    const fetcher = vi.fn().mockResolvedValue(json(created, 201));
    vi.stubGlobal("fetch", fetcher);
    render(<HomeworkStaff initial={[]} role="lecturer" />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: " 01219245 " } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "HW9 New" } });
    fireEvent.change(screen.getByLabelText("Due date and time"), { target: { value: "2099-03-01T09:30" } });
    fireEvent.change(screen.getByLabelText("Maximum score"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign homework" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Homework assigned");
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ course_id: "01219245", title: "HW9 New", max_score: 50 });
    expect(body.due_at).toBe(new Date("2099-03-01T09:30").toISOString());   // local time -> UTC instant
    expect(screen.getByText("HW9 New")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");                   // form cleared
  });

  it("shows the server's reason when assigning is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Lecturer access required." }, 403)));
    render(<HomeworkStaff initial={[]} role="lecturer" />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Due date and time"), { target: { value: "2099-03-01T09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign homework" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not allowed"));
  });
});
