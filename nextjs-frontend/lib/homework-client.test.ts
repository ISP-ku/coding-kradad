import { afterEach, describe, expect, it, vi } from "vitest";
import { assignHomework, gradeSubmission, loadSubmissions, submitHomework } from "./homework-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const offline = () => vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

afterEach(() => vi.unstubAllGlobals());

describe("loadSubmissions", () => {
  it("GETs the submissions for one homework", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([{ id: 7 }]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadSubmissions(3)).toEqual({ submissions: [{ id: 7 }] });
    expect(fetchMock).toHaveBeenCalledWith("/api/homework/3/submissions");
  });

  it("returns the server's message, or a plain one when offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Homework not found." }, 404)));
    expect(await loadSubmissions(3)).toEqual({ error: "Homework not found." });
    vi.stubGlobal("fetch", offline());
    expect(await loadSubmissions(3)).toEqual({ error: "Could not reach the server. Please try again." });
  });
});

describe("gradeSubmission", () => {
  it("PATCHes the score and feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 7, score: 17 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await gradeSubmission({ id: 7, homework_id: 1 }, 17, "Good")).toEqual({ submission: { id: 7, score: 17 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/homework/1/submissions/7", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ score: 17, feedback: "Good" });
  });

  it("falls back to its own message when the server sends none", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })));
    expect(await gradeSubmission({ id: 7, homework_id: 1 }, 1, "")).toEqual({ error: "Could not save the grade. Please try again." });
  });
});

describe("submitHomework", () => {
  it("POSTs the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 9, answer: "x" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitHomework(2, "x")).toEqual({ submission: { id: 9, answer: "x" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/homework/2/submissions", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ answer: "x" });
  });

  it("never throws when offline", async () => {
    vi.stubGlobal("fetch", offline());
    expect(await submitHomework(2, "x")).toEqual({ error: "Could not reach the server. Please try again." });
  });
});

describe("assignHomework", () => {
  const homework = { course_id: "01219245", title: "HW9", description: "", due_at: "2099-03-01T02:30:00.000Z", max_score: 50 };

  it("POSTs the new homework", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 9, ...homework }, 201));
    vi.stubGlobal("fetch", fetchMock);
    expect(await assignHomework(homework)).toEqual({ homework: { id: 9, ...homework } });
    expect(fetchMock).toHaveBeenCalledWith("/api/homework", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(homework);
  });

  it("explains a refused request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 403)));
    expect(await assignHomework(homework)).toEqual({ error: "Your account is not allowed to do this." });
  });
});
