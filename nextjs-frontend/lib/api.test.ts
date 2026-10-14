import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// API_BASE / loginUrl / logoutUrl are computed once at module load from
// process.env, so each scenario needs a fresh module instance.
async function loadApi() {
  vi.resetModules();
  return import("./api");
}

describe("lib/api (preview mode off)", () => {
  beforeEach(() => {
    vi.stubEnv("UI_PREVIEW", "0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points loginUrl/logoutUrl at the FastAPI backend", async () => {
    vi.stubEnv("API_BASE_URL", "http://localhost:8000");
    const { loginUrl, logoutUrl, API_BASE } = await loadApi();

    expect(API_BASE).toBe("http://localhost:8000");
    expect(loginUrl("google")).toBe("http://localhost:8000/login/google");
    expect(logoutUrl).toBe("http://localhost:8000/logout");
  });

  it("falls back to localhost:8000 when API_BASE_URL is unset", async () => {
    delete process.env.API_BASE_URL;
    const { API_BASE } = await loadApi();
    expect(API_BASE).toBe("http://localhost:8000");
  });
});

describe("lib/api (preview mode on)", () => {
  beforeEach(() => {
    vi.stubEnv("UI_PREVIEW", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points loginUrl/logoutUrl at the local preview routes instead of the backend", async () => {
    const { loginUrl, logoutUrl } = await loadApi();

    expect(loginUrl("google")).toBe("/preview-login?provider=google");
    expect(logoutUrl).toBe("/preview-logout");
  });
});

describe("backend local test login availability", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("shows the local option only when the backend enables it", async () => {
    vi.stubEnv("UI_PREVIEW", "0"); vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ local_test_login: true }) }));
    expect(await (await loadApi()).localTestLoginAvailable()).toBe(true);
  });
  it("hides the option if the backend is unavailable", async () => {
    vi.stubEnv("UI_PREVIEW", "0"); vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await (await loadApi()).localTestLoginAvailable()).toBe(false);
  });
  it("never shows the option in a production frontend", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await (await loadApi()).localTestLoginAvailable()).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
