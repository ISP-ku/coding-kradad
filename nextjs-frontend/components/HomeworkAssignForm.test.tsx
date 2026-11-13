import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeworkAssignForm from "./HomeworkAssignForm";
import type { HomeworkItem } from "@/lib/types";

const hw = (over: Partial<HomeworkItem>): HomeworkItem => ({
  id: 1, course_id: "01219245", title: "HW1", description: "", due_at: "2099-01-01T02:00:00Z",
  max_score: 20, created_at: "2026-10-01T00:00:00Z", status: null, is_overdue: false,
  my_submission: null, submission_count: 0, graded_count: 0, ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const onCreated = vi.fn();

afterEach(() => { vi.unstubAllGlobals(); onCreated.mockReset(); });

describe("HomeworkAssignForm", () => {
  it("validates the assign form before sending", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<HomeworkAssignForm onCreated={onCreated} />);
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
    render(<HomeworkAssignForm onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: " 01219245 " } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "HW9 New" } });
    fireEvent.change(screen.getByLabelText("Due date and time"), { target: { value: "2099-03-01T09:30" } });
    fireEvent.change(screen.getByLabelText("Maximum score"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign homework" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Homework assigned");
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ course_id: "01219245", title: "HW9 New", max_score: 50 });
    expect(body.due_at).toBe(new Date("2099-03-01T09:30").toISOString());   // local time -> UTC instant
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(screen.getByLabelText("Title")).toHaveValue("");                   // form cleared
  });

  it("shows the server's reason when assigning is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Lecturer access required." }, 403)));
    render(<HomeworkAssignForm onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Due date and time"), { target: { value: "2099-03-01T09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign homework" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not allowed"));
  });
  it("fills the due date and points from quick picks", () => {
    render(<HomeworkAssignForm onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: "In a week" }));
    const week = new Date();
    week.setDate(week.getDate() + 7);
    expect(screen.getByLabelText("Due date and time")).toHaveValue(`${week.toLocaleDateString("en-CA")}T23:59`);
    fireEvent.click(screen.getByRole("button", { name: "20 points" }));
    expect(screen.getByLabelText("Maximum score")).toHaveValue(20);
  });

  it("suggests known course codes", () => {
    render(<HomeworkAssignForm onCreated={onCreated} courses={["01219245"]} />);
    expect(screen.getByLabelText("Course")).toHaveAttribute("list", "homework-courses");
  });
});
