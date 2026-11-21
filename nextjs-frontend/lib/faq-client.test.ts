import { afterEach, describe, expect, it, vi } from "vitest";
import { commentCountLabel, postComment, setTopicSaved } from "./faq-client";

afterEach(() => vi.unstubAllGlobals());

describe("setTopicSaved", () => {
  it("POSTs to save and DELETEs to unsave", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(await setTopicSaved(7, true)).toBe(true);
    expect(await setTopicSaved(7, false)).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/faq/7/save", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/faq/7/save", { method: "DELETE" });
  });

  it("reports failure on an error status or a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await setTopicSaved(7, true)).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await setTopicSaved(7, true)).toBe(false);
  });
});

describe("commentCountLabel", () => {
  it("uses the singular only for one comment", () => {
    expect(commentCountLabel(0)).toBe("0 comments");
    expect(commentCountLabel(1)).toBe("1 comment");
    expect(commentCountLabel(2)).toBe("2 comments");
  });
});

describe("postComment", () => {
  it("returns the saved comment", async () => {
    const saved = { id: 2, author: "google:1", body: "Hi", created_at: "2026-11-03T09:00:00Z" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => saved });
    vi.stubGlobal("fetch", fetchMock);

    expect(await postComment(4, "Hi")).toEqual({ comment: saved });
    expect(fetchMock).toHaveBeenCalledWith("/api/faq/4/comments", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "Hi" }),
    });
  });

  it("turns every failure into a message instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await postComment(4, "Hi")).toEqual({ error: "Please sign in to comment." });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await postComment(4, "Hi")).toEqual({ error: "Could not post your comment. Please try again." });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await postComment(4, "Hi")).toEqual({ error: "Could not reach the server. Please try again." });
  });
});
