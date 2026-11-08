import { afterEach, describe, expect, it, vi } from "vitest";

const proxy = vi.hoisted(() => vi.fn().mockResolvedValue(new Response("{}")));
vi.mock("@/lib/activity-proxy", () => ({ proxyActivityRequest: proxy }));

afterEach(() => vi.clearAllMocks());

describe("homework API proxy routes", () => {
  it("list and assign go to /api/homework", async () => {
    const route = await import("./route");
    await route.GET();
    await route.POST(new Request("http://x", { method: "POST", body: '{"a":1}' }));
    expect(proxy).toHaveBeenNthCalledWith(1, "/api/homework", "GET");
    expect(proxy).toHaveBeenNthCalledWith(2, "/api/homework", "POST", '{"a":1}');
  });

  it("submissions list and submit go to the right homework", async () => {
    const route = await import("./[homeworkId]/submissions/route");
    const ctx = { params: { homeworkId: "5" } };
    await route.GET(new Request("http://x"), ctx);
    await route.POST(new Request("http://x", { method: "POST", body: '{"answer":"a"}' }), ctx);
    expect(proxy).toHaveBeenNthCalledWith(1, "/api/homework/5/submissions", "GET");
    expect(proxy).toHaveBeenNthCalledWith(2, "/api/homework/5/submissions", "POST", '{"answer":"a"}');
  });

  it("grading goes to the right submission, and ids cannot escape the path", async () => {
    const route = await import("./[homeworkId]/submissions/[submissionId]/route");
    await route.PATCH(new Request("http://x", { method: "PATCH", body: '{"score":3}' }), { params: { homeworkId: "5", submissionId: "7" } });
    await route.PATCH(new Request("http://x", { method: "PATCH", body: "{}" }), { params: { homeworkId: "5", submissionId: "../../admin" } });
    expect(proxy).toHaveBeenNthCalledWith(1, "/api/homework/5/submissions/7", "PATCH", '{"score":3}');
    expect(proxy.mock.calls[1][0]).toBe("/api/homework/5/submissions/..%2F..%2Fadmin");
  });
});
