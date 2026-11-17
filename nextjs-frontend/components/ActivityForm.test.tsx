import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActivityForm from "./ActivityForm";
import type { CourseActivity } from "@/lib/types";

const TAS = [{ id: "google:ta-1", name: "Nida" }, { id: "google:ta-2", name: "Krit" }];
const onSaved = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { vi.unstubAllGlobals(); onSaved.mockReset(); });

function fillCreate() {
  fireEvent.change(screen.getByLabelText("Course"), { target: { value: " 01219245 " } });
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lab 4 setup" } });
  fireEvent.click(screen.getByRole("radio", { name: /Lab session/ }));
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2099-03-01" } });
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "13:00" } });
  fireEvent.change(screen.getByLabelText("Location or meeting link"), { target: { value: "Room E204" } });
  fireEvent.change(screen.getByLabelText("Assign to TA"), { target: { value: "google:ta-2" } });
}

describe("ActivityForm (create)", () => {
  it("shows every missing field at once and sends nothing", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<ActivityForm mode="create" assignees={TAS} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save and assign" }));
    for (const msg of ["Enter the course code.", "Give the activity a title.", "Choose what kind of activity this is.",
      "Pick a date.", "Pick a time.", "Say where it happens.", "Choose a TA."]) {
      expect(screen.getByText(msg)).toBeInTheDocument();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the activity with the chosen type, time and TA", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: 1 }, 201));
    vi.stubGlobal("fetch", fetcher);
    render(<ActivityForm mode="create" assignees={TAS} onSaved={onSaved} />);
    fillCreate();
    fireEvent.click(screen.getByRole("button", { name: "Save and assign" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledWith("/api/activities", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      course_id: "01219245", title: "Lab 4 setup", type: "lab", location: "Room E204", assignee_id: "google:ta-2",
      starts_at: new Date("2099-03-01T13:00").toISOString(),
    });
  });

  it("fills the date and time from quick picks", () => {
    render(<ActivityForm mode="create" assignees={TAS} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(screen.getByLabelText("Date")).toHaveValue(tomorrow.toLocaleDateString("en-CA"));
    fireEvent.click(screen.getByRole("button", { name: "23:59" }));
    expect(screen.getByLabelText("Time")).toHaveValue("23:59");
  });

  it("suggests known course codes", () => {
    render(<ActivityForm mode="create" assignees={TAS} courses={["01219245", "01219243"]} onSaved={onSaved} />);
    expect(screen.getByLabelText("Course")).toHaveAttribute("list", "activity-courses");
    expect(document.querySelectorAll("#activity-courses option")).toHaveLength(2);
  });

  it("explains why it cannot save when there are no TAs", () => {
    render(<ActivityForm mode="create" assignees={[]} onSaved={onSaved} />);
    expect(screen.getByText(/No TA accounts yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and assign" })).toBeDisabled();
  });

  it("shows the server's reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Lecturer access required." }, 403)));
    render(<ActivityForm mode="create" assignees={TAS} onSaved={onSaved} />);
    fillCreate();
    fireEvent.click(screen.getByRole("button", { name: "Save and assign" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Lecturer access required.");
  });
});

describe("ActivityForm (edit)", () => {
  const activity: CourseActivity = {
    id: 7, course_id: "01219245", title: "Quiz 2", type: "deadline", starts_at: new Date("2099-05-02T09:30").toISOString(),
    location: "Online", created_by: "x", tasks: [],
  };

  it("starts with the current details and keeps the TA assignment out of it", () => {
    render(<ActivityForm mode="edit" activity={activity} onSaved={onSaved} />);
    expect(screen.getByLabelText("Title")).toHaveValue("Quiz 2");
    expect(screen.getByRole("radio", { name: /Deadline/ })).toBeChecked();
    expect(screen.getByLabelText("Date")).toHaveValue("2099-05-02");
    expect(screen.getByLabelText("Time")).toHaveValue("09:30");
    expect(screen.queryByLabelText("Assign to TA")).not.toBeInTheDocument();
  });

  it("saves changes with PATCH", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: 7 }));
    vi.stubGlobal("fetch", fetcher);
    render(<ActivityForm mode="edit" activity={activity} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Quiz 2 (moved)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledWith("/api/activities/7", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ title: "Quiz 2 (moved)", type: "deadline" });
  });
});
