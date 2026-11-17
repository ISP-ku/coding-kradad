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

  it("points to New course when there are no courses", () => {
    render(<AccessManager initial={{ courses: [], accounts: [] }} />);
    expect(screen.getByText(/Use New course to create one/)).toBeInTheDocument();
  });

  it("has no inline forms: creating and adding live on their own pages", () => {
    render(<AccessManager initial={DATA} />);
    expect(screen.queryByLabelText("KU email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create course" })).not.toBeInTheDocument();
  });

  it("opens on the course and confirmation it was sent back with", () => {
    render(<AccessManager initial={DATA} initialCourseId={2} initialNotice="new@ku.th now has access." />);
    expect(screen.getByRole("table", { name: "Members of CS202" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("new@ku.th now has access.");
  });

  it("shows the server's reason when a role change is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "You cannot change your own access. Ask another lecturer." }, 400)));
    render(<AccessManager initial={DATA} />);
    fireEvent.change(within(rowFor("somchai@ku.th")).getByLabelText("Role for somchai@ku.th"), { target: { value: "ta" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Ask another lecturer");
  });
});
