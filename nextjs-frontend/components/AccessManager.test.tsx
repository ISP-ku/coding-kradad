import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccessManager from "./AccessManager";
import type { AccessData } from "@/lib/access";

const DATA: AccessData = {
  courses: [
    { id: 1, code: "CS101", name: "Intro" },
    { id: 2, code: "CS202", name: "Data" },
  ],
  accounts: [
    { email: "boss@ku.th", role: "lecturer", course_ids: [], protected: true, is_self: false },
    { email: "me@ku.th", role: "lecturer", course_ids: [1], protected: false, is_self: true },
    { email: "nida@ku.th", role: "ta", course_ids: [1, 2], protected: false, is_self: false },
    { email: "somchai@ku.th", role: "student", course_ids: [1], protected: false, is_self: false },
    { email: "only202@ku.th", role: "student", course_ids: [2], protected: false, is_self: false },
  ],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const table = () => screen.getByRole("table", { name: /Members of/ });
const rowFor = (email: string) => within(table()).getByRole("row", { name: new RegExp(email) });

afterEach(() => vi.unstubAllGlobals());

describe("AccessManager", () => {
  it("lists the members of the first course with their role and courses", () => {
    render(<AccessManager initial={DATA} />);
    expect(screen.getByRole("table", { name: "Members of CS101" })).toBeInTheDocument();
    expect(within(table()).getAllByRole("row")).toHaveLength(4); // header + 3 members
    expect(within(rowFor("nida@ku.th")).getByLabelText("Role for nida@ku.th")).toHaveValue("ta");
    expect(within(rowFor("nida@ku.th")).getByText("CS101, CS202")).toBeInTheDocument();
    expect(screen.queryByText("only202@ku.th")).not.toBeInTheDocument();
  });

  it("switches course", () => {
    render(<AccessManager initial={DATA} />);
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: "2" } });
    expect(screen.getByRole("table", { name: "Members of CS202" })).toBeInTheDocument();
    expect(screen.getByText("only202@ku.th")).toBeInTheDocument();
    expect(screen.queryByText("somchai@ku.th")).not.toBeInTheDocument();
  });

  it("locks your own row and lists always-allowed lecturers", () => {
    render(<AccessManager initial={DATA} />);
    expect(within(rowFor("me@ku.th")).getByLabelText("Role for me@ku.th")).toBeDisabled();
    expect(within(rowFor("me@ku.th")).getByRole("button", { name: "Remove me@ku.th from CS101" })).toBeDisabled();
    expect(screen.getByText(/boss@ku\.th/)).toBeInTheDocument();
  });

  it("adds a member and shows them in the table", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(
      { email: "new@ku.th", role: "ta", course_ids: [1], protected: false, is_self: false }, 201));
    vi.stubGlobal("fetch", fetcher);
    render(<AccessManager initial={DATA} />);
    fireEvent.change(screen.getByLabelText("KU email"), { target: { value: " New@KU.th " } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "ta" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CS101" }));

    expect(await screen.findByRole("status")).toHaveTextContent("new@ku.th now has access to CS101");
    expect(fetcher).toHaveBeenCalledWith("/api/access/courses/1/members", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ email: "new@ku.th", role: "ta" });
    expect(rowFor("new@ku.th")).toBeInTheDocument();
    expect(screen.getByLabelText("KU email")).toHaveValue("");
  });

  it("checks the email before sending", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<AccessManager initial={DATA} />);
    fireEvent.change(screen.getByLabelText("KU email"), { target: { value: "someone@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CS101" }));
    expect(screen.getByText("Enter a KU email address ending in @ku.th.")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("changes a role", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(
      { email: "somchai@ku.th", role: "ta", course_ids: [1], protected: false, is_self: false }));
    vi.stubGlobal("fetch", fetcher);
    render(<AccessManager initial={DATA} />);
    fireEvent.change(within(rowFor("somchai@ku.th")).getByLabelText("Role for somchai@ku.th"), { target: { value: "ta" } });
    expect(await screen.findByRole("status")).toHaveTextContent("somchai@ku.th is now a TA");
    expect(fetcher).toHaveBeenCalledWith("/api/access/accounts/somchai%40ku.th", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ role: "ta" });
  });

  it("removes a member", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    render(<AccessManager initial={DATA} />);
    fireEvent.click(within(rowFor("somchai@ku.th")).getByRole("button", { name: "Remove somchai@ku.th from CS101" }));
    await waitFor(() => expect(screen.queryByText("somchai@ku.th")).not.toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/access/courses/1/members/somchai%40ku.th", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows the server's error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "nida@ku.th is already in this course." }, 409)));
    render(<AccessManager initial={DATA} />);
    fireEvent.change(screen.getByLabelText("KU email"), { target: { value: "nida@ku.th" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CS101" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nida@ku.th is already in this course.");
  });

  it("creates a course and selects it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ id: 3, code: "CS303", name: "Systems" }, 201)));
    render(<AccessManager initial={DATA} />);
    fireEvent.change(screen.getByLabelText("New course code"), { target: { value: "CS303" } });
    fireEvent.change(screen.getByLabelText("Course name (optional)"), { target: { value: "Systems" } });
    fireEvent.click(screen.getByRole("button", { name: "Create course" }));
    expect(await screen.findByRole("region", { name: "Manage CS303" })).toBeInTheDocument();
    expect(screen.getByLabelText("Course")).toHaveValue("3");
    expect(screen.getByRole("button", { name: "Add to CS303" })).toBeInTheDocument();
    expect(screen.getByText("No one is in this course yet.")).toBeInTheDocument();
  });

  it("asks for a first course when there are none", () => {
    render(<AccessManager initial={{ courses: [], accounts: [] }} />);
    expect(screen.getByText(/Create a course first/)).toBeInTheDocument();
    expect(screen.queryByLabelText("KU email")).not.toBeInTheDocument();
  });
});
