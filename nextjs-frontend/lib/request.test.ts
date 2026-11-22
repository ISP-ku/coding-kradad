import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./request";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("GETs without options and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ a: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await request("/api/x", { fallback: "fb" })).toEqual({ data: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/x");
  });

  it("sends a JSON body with its method", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await request("/api/x", { method: "PATCH", body: { role: "ta" }, fallback: "fb" });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"role":"ta"}',
    });
  });

  it("sends a bodiless request with just its method, and reads 204 as no data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await request("/api/x", { method: "DELETE", fallback: "fb" })).toEqual({ data: undefined });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { method: "DELETE" });
  });

  it("returns the server's message, the fallback, or the offline message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "No such course." }, 404)));
    expect(await request("/api/x", { fallback: "fb" })).toEqual({ error: "No such course." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })));
    expect(await request("/api/x", { fallback: "fb" })).toEqual({ error: "fb" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await request("/api/x", { fallback: "fb" })).toEqual({ error: "Could not reach the server. Please try again." });
  });
});
