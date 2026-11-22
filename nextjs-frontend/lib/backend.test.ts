import { afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => jar }));

import { backendFetch, backendJson, forwardedCookies } from "./backend";

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe("backend helpers", () => {
  it("joins every browser cookie into one header", () => {
    jar.getAll.mockReturnValue([{ name: "ku_session", value: "abc" }, { name: "theme", value: "dark" }]);
    expect(forwardedCookies()).toBe("ku_session=abc; theme=dark");
    jar.getAll.mockReturnValue([]);
    expect(forwardedCookies()).toBe("");
  });

  it("calls the backend with the cookies, its own headers, and no caching", async () => {
    jar.getAll.mockReturnValue([{ name: "ku_session", value: "abc" }]);
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await backendFetch("/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8000/api/x", {
      method: "POST", body: "{}", cache: "no-store",
      headers: { "content-type": "application/json", cookie: "ku_session=abc" },
    });
  });

  it("returns parsed JSON, or null for an error status or an unreachable backend", async () => {
    jar.getAll.mockReturnValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([1, 2]))));
    expect(await backendJson<number[]>("/api/x")).toEqual([1, 2]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    expect(await backendJson("/api/x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await backendJson("/api/x")).toBeNull();
  });
});
