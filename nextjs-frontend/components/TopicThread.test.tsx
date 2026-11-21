import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser, TopicDetail } from "@/lib/types";
import TopicThread from "./TopicThread";

afterEach(() => vi.unstubAllGlobals());

const student: SessionUser = { id: "s1", username: "Student", provider: "google", role: "student" };
const topic: TopicDetail = {
  id: 4, title: "When is the midterm?", description: "Week 8?", status: "Published", submitted_by: "google:1",
  created_at: "2026-11-01T09:00:00Z", comment_count: 1, saved: false,
  comments: [{ id: 1, author: "google:2", body: "Week 8, room 204.", created_at: "2026-11-02T09:00:00Z" }],
};

const thread = (viewer: SessionUser | null = student) =>
  render(<TopicThread topic={topic} viewer={viewer} preview={false} />);
const write = (text: string) => fireEvent.change(screen.getByLabelText("Add a comment"), { target: { value: text } });
const post = () => fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

describe("TopicThread", () => {
  it("shows the topic and its discussion", () => {
    thread();
    expect(screen.getByText("Week 8, room 204.")).toBeInTheDocument();
    expect(screen.getByText("1 comment")).toBeInTheDocument();
  });

  it("asks a signed-out visitor to sign in instead of showing the form", () => {
    thread(null);
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/");
  });

  it("refuses an empty comment without calling the server", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    thread();
    write("   ");
    post();
    expect(screen.getByRole("alert")).toHaveTextContent("Please write a comment first.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts the trimmed comment, adds it to the thread and clears the box", async () => {
    const saved = { id: 2, author: "google:s1", body: "Thanks!", created_at: "2026-11-03T09:00:00Z" };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => saved });
    vi.stubGlobal("fetch", fetcher);
    thread();
    write("  Thanks!  ");
    post();

    expect(await screen.findByText("Thanks!")).toBeInTheDocument();
    expect(screen.getByText("2 comments")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("");
    expect(fetcher).toHaveBeenCalledWith("/api/faq/4/comments", expect.objectContaining({
      method: "POST", body: JSON.stringify({ body: "Thanks!" }),
    }));
  });

  it.each([
    [{ ok: false, status: 401 }, "Please sign in to comment."],
    [{ ok: false, status: 500 }, "Could not post your comment. Please try again."],
  ])("explains a refused comment (%o)", async (response, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    thread();
    write("Hello");
    post();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Hello");
  });

  it("explains when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    thread();
    write("Hello");
    post();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server. Please try again.");
  });
});
