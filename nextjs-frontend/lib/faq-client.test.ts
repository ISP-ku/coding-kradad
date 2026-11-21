import { afterEach, describe, expect, it, vi } from "vitest";
import { commentCountLabel, setTopicSaved } from "./faq-client";

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
