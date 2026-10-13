import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("GET /preview-login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to /dashboard and sets the preview cookie when preview mode is on", async () => {
    vi.stubEnv("UI_PREVIEW", "1");
    const { GET } = await loadRoute();

    const req = new NextRequest("http://localhost:3000/preview-login?provider=google");
    const res = GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(res.cookies.get("preview_user")?.value).toBe("google");
  });

  it("defaults to the google provider when none is given", async () => {
    vi.stubEnv("UI_PREVIEW", "1");
    const { GET } = await loadRoute();

    const req = new NextRequest("http://localhost:3000/preview-login");
    const res = GET(req);

    expect(res.cookies.get("preview_user")?.value).toBe("google");
  });

  it("redirects to / and does not set a cookie when preview mode is off", async () => {
    vi.stubEnv("UI_PREVIEW", "0");
    const { GET } = await loadRoute();

    const req = new NextRequest("http://localhost:3000/preview-login?provider=google");
    const res = GET(req);

    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(res.cookies.get("preview_user")).toBeUndefined();
  });
});

it("cannot enable fake sign-in in a production build", async () => {
  vi.stubEnv("UI_PREVIEW", "1");
  vi.stubEnv("NODE_ENV", "production");
  try {
    const { GET } = await loadRoute();
    const res = GET(new NextRequest("http://localhost:3000/preview-login"));
    expect(res.cookies.get("preview_user")).toBeUndefined();
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  } finally { vi.unstubAllEnvs(); }
});
