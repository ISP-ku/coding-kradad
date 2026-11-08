import { afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => jar }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe("activity proxy", () => {
  it("forwards the browser session cookie and passes backend denials through unchanged", async () => {
    jar.getAll.mockReturnValue([{ name: "ku_session", value: "abc" }]);
    const upstream = new Response(JSON.stringify({ detail: "Teaching staff access required." }), {
      status: 403, headers: { "content-type": "application/json" },
    });
    const fetcher = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetcher);
    const { proxyActivityRequest } = await import("./activity-proxy");

    const response = await proxyActivityRequest("/api/activities", "GET");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "Teaching staff access required." });
    expect(fetcher.mock.calls[0][1].headers.cookie).toBe("ku_session=abc");
    expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
  });

  it("stays unauthenticated (401 from backend) when there is no cookie", async () => {
    jar.getAll.mockReturnValue([]);
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    const { proxyActivityRequest } = await import("./activity-proxy");
    expect((await proxyActivityRequest("/api/activities", "GET")).status).toBe(401);
    expect(fetcher.mock.calls[0][1].headers.cookie).toBe("");
  });

  it("answers 502 without leaking details when the backend is down", async () => {
    jar.getAll.mockReturnValue([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:8000")));
    const { proxyActivityRequest } = await import("./activity-proxy");
    const response = await proxyActivityRequest("/api/activities", "POST", "{}");
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.5");
  });
});
