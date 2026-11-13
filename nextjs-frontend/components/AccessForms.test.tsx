import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessCourseForm, AccessMemberForm } from "./AccessForms";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const COURSES = [{ id: 1, code: "CS101", name: "Intro" }, { id: 2, code: "CS202", name: "Data" }];
const onDone = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); onDone.mockReset(); });

describe("AccessMemberForm", () => {
  it("starts on the course it was opened for", () => {
    render(<AccessMemberForm courses={COURSES} defaultCourseId={2} onDone={onDone} />);
    expect(screen.getByLabelText("Course")).toHaveValue("2");
    expect(screen.getByLabelText("Role")).toHaveValue("student");
  });

  it("checks the email before sending", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<AccessMemberForm courses={COURSES} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText("KU email"), { target: { value: "someone@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to course" }));
    expect(screen.getByText("Enter a KU email address ending in @ku.th.")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("adds the person to the chosen course with the chosen role", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ email: "new@ku.th", role: "ta", course_ids: [2], protected: false, is_self: false }, 201));
    vi.stubGlobal("fetch", fetcher);
    render(<AccessMemberForm courses={COURSES} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("KU email"), { target: { value: " New@KU.th " } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "ta" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to course" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(2, "new@ku.th"));
    expect(fetcher).toHaveBeenCalledWith("/api/access/courses/2/members", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ email: "new@ku.th", role: "ta" });
  });

  it("shows the server's reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "nida@ku.th is already in this course." }, 409)));
    render(<AccessMemberForm courses={COURSES} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText("KU email"), { target: { value: "nida@ku.th" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to course" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already in this course");
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("AccessCourseForm", () => {
  it("needs a course code", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<AccessCourseForm onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Create course" }));
    expect(screen.getByText("Enter a course code.")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates the course", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: 3, code: "CS303", name: "Systems" }, 201));
    vi.stubGlobal("fetch", fetcher);
    render(<AccessCourseForm onDone={onDone} />);
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: " CS303 " } });
    fireEvent.change(screen.getByLabelText("Course name (optional)"), { target: { value: "Systems" } });
    fireEvent.click(screen.getByRole("button", { name: "Create course" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(3));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ code: "CS303", name: "Systems" });
  });
});
