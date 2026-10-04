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
    expect(loginUrl("discord")).toBe("http://localhost:8000/login/discord");
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
