import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser, Topic } from "@/lib/types";
import TopicBoard from "./TopicBoard";

afterEach(() => vi.unstubAllGlobals());

const topic = (id: number, extra: Partial<Topic> = {}): Topic => ({
  id, title: `Topic ${id}`, description: `About ${id}`, status: "Published", submitted_by: "google:1",
  created_at: "2026-11-01T09:00:00Z", comment_count: 0, saved: false, ...extra,
});
const student: SessionUser = { id: "s1", username: "Student", provider: "google", role: "student" };
const lecturer: SessionUser = { id: "l1", username: "Lecturer", provider: "google", role: "lecturer" };

function board(props: Partial<Parameters<typeof TopicBoard>[0]> = {}) {
  return render(
    <TopicBoard initialTopics={[topic(1, { comment_count: 1 }), topic(2, { comment_count: 3 })]}
      initialPending={[]} viewer={student} preview={false} query="" {...props} />,
  );
}

describe("TopicBoard", () => {
  it("lists topics with links and comment counts", () => {
    board();
    expect(screen.getByRole("link", { name: "Topic 1" })).toHaveAttribute("href", "/faq/1");
    expect(screen.getByText("1 comment")).toBeInTheDocument();
    expect(screen.getByText("3 comments")).toBeInTheDocument();
  });

  it("hides Save and the Saved tab from signed-out visitors", () => {
    board({ viewer: null });
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Saved topics" })).not.toBeInTheDocument();
  });

  it("explains an empty search result", () => {
    board({ initialTopics: [] });
    expect(screen.getByText("No matching topics found.")).toBeInTheDocument();
  });

  it("saves a topic straight away and undoes it if the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    board();
    const [first] = screen.getAllByRole("button", { name: "☆ Save" });
    fireEvent.click(first);
    expect(screen.getByRole("button", { name: "★ Saved" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "★ Saved" })).not.toBeInTheDocument());
  });

  it("loads the Saved tab once and shows an empty message", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetcher);
    board();
    fireEvent.click(screen.getByRole("tab", { name: "Saved topics" }));
    expect(await screen.findByText("You haven't saved any topics yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "All topics" }));
    fireEvent.click(screen.getByRole("tab", { name: "Saved topics" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shows the review queue only to a lecturer", () => {
    board({ initialPending: [topic(5, { status: "Pending" })] });
    expect(screen.queryByText("Pending review")).not.toBeInTheDocument();
  });

  it("publishes an approved topic and removes it from the queue", async () => {
    const approved = topic(5, { title: "New question" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => approved }));
    board({ viewer: lecturer, initialPending: [topic(5, { title: "New question", status: "Pending" })] });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("link", { name: "New question" })).toBeInTheDocument();
    expect(screen.getByText("Nothing waiting on review.")).toBeInTheDocument();
  });

  it("drops a rejected topic without publishing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => topic(5) }));
    board({ viewer: lecturer, initialPending: [topic(5, { title: "Spam", status: "Pending" })] });

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Nothing waiting on review.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Spam" })).not.toBeInTheDocument();
  });

  it("keeps the topic in the queue and explains when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    board({ viewer: lecturer, initialPending: [topic(5, { title: "Question", status: "Pending" })] });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not approve this topic. Please try again.");
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("explains when the server cannot be reached instead of failing silently", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    board({ viewer: lecturer, initialPending: [topic(5, { status: "Pending" })] });

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server. Please try again.");
  });

  it("removes a topic another lecturer already reviewed and says so", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    board({ viewer: lecturer, initialPending: [topic(5, { title: "Question", status: "Pending" })] });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another lecturer has already reviewed this topic.");
    expect(screen.getByText("Nothing waiting on review.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Question" })).not.toBeInTheDocument();
  });

  it("clears the old message on the next successful review", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => topic(5) });
    vi.stubGlobal("fetch", fetcher);
    board({ viewer: lecturer, initialPending: [topic(5, { status: "Pending" })] });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
