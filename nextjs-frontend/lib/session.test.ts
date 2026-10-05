import { afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => jar }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

async function load() {
  vi.resetModules();
  vi.stubEnv("UI_PREVIEW", "0");
  vi.stubEnv("API_BASE_URL", "http://localhost:8000");
  return import("./session");
}

describe("KU backend session", () => {
  it("does not accept a preview cookie in real login mode", async () => {
    jar.get.mockImplementation((key) => key === "preview_user" ? { value: "google" } : undefined);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await (await load()).getSessionUser()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("forwards only the KU session cookie to /api/me", async () => {
    jar.get.mockReturnValue({ value: "signed-session" });
    const user = { id: "123", provider: "google", email: "student@ku.th" };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => user });
    vi.stubGlobal("fetch", fetcher);
    expect(await (await load()).getSessionUser()).toEqual(user);
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8000/api/me", {
      headers: { cookie: "ku_session=signed-session" }, cache: "no-store",
    });
  });
  it("returns signed-out state after the backend rejects a session", async () => {
    jar.get.mockReturnValue({ value: "expired-session" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await (await load()).getSessionUser()).toBeNull();
  });
});
