import { afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ get: vi.fn(), getAll: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => jar }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

async function load() {
  vi.resetModules();
  vi.stubEnv("UI_PREVIEW", "0");
  vi.stubEnv("API_BASE_URL", "http://localhost:8000");
  return import("./faq");
}

const ok = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe("FAQ data loading", () => {
  it("searches with the keyword and forwards the browser's cookies", async () => {
    jar.getAll.mockReturnValue([{ name: "ku_session", value: "s1" }, { name: "theme", value: "dark" }]);
    const fetcher = ok([{ id: 1 }]); vi.stubGlobal("fetch", fetcher);

    expect(await (await load()).getTopics("midterm")).toEqual([{ id: 1 }]);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("http://localhost:8000/api/faq?q=midterm");
    expect(init).toEqual({ headers: { cookie: "ku_session=s1; theme=dark" }, cache: "no-store" });
  });

  it("works for a signed-out visitor and sends no q for an empty search", async () => {
    jar.getAll.mockReturnValue([]);
    const fetcher = ok([]); vi.stubGlobal("fetch", fetcher);

    expect(await (await load()).getTopics("")).toEqual([]);
    expect(String(fetcher.mock.calls[0][0])).toBe("http://localhost:8000/api/faq");
  });

  it("returns an empty list or null when the backend fails", async () => {
    jar.getAll.mockReturnValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const faq = await load();
    expect(await faq.getTopics("x")).toEqual([]);
    expect(await faq.getTopicDetail("9")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend down")));
    expect(await faq.getTopics("x")).toEqual([]);
  });

  it("loads one topic by id", async () => {
    jar.getAll.mockReturnValue([]);
    const fetcher = ok({ id: 9, comments: [] }); vi.stubGlobal("fetch", fetcher);

    expect(await (await load()).getTopicDetail("9")).toEqual({ id: 9, comments: [] });
    expect(String(fetcher.mock.calls[0][0])).toBe("http://localhost:8000/api/faq/9");
  });

  it("skips the lecturer review queue when nobody is signed in", async () => {
    jar.get.mockReturnValue(undefined);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);

    expect(await (await load()).getPendingTopics()).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads the review queue for a signed-in viewer", async () => {
    jar.get.mockReturnValue({ value: "s1" });
    jar.getAll.mockReturnValue([{ name: "ku_session", value: "s1" }]);
    const fetcher = ok([{ id: 3 }]); vi.stubGlobal("fetch", fetcher);

    expect(await (await load()).getPendingTopics()).toEqual([{ id: 3 }]);
    expect(String(fetcher.mock.calls[0][0])).toBe("http://localhost:8000/api/faq/pending");
  });
});
