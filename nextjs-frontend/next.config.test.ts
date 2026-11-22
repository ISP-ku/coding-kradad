import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

type Rewrite = { source: string; destination: string };

async function rewrites(): Promise<Rewrite[]> {
  vi.resetModules();
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:8000");
  const { default: config } = await import("./next.config.mjs");
  return (await config.rewrites!()) as Rewrite[];
}

describe("next.config.mjs", () => {
  it("passes every backend route the browser uses through this site, so the session cookie is set here", async () => {
    const map = Object.fromEntries((await rewrites()).map((r) => [r.source, r.destination]));
    expect(map).toEqual({
      "/api/:path*": "http://127.0.0.1:8000/api/:path*",
      "/login/:provider": "http://127.0.0.1:8000/login/:provider",
      "/callback/:provider": "http://127.0.0.1:8000/callback/:provider",
      "/logout": "http://127.0.0.1:8000/logout",
      "/password-login": "http://127.0.0.1:8000/password-login",
      "/local-test-login": "http://127.0.0.1:8000/local-test-login",
    });
  });

  it("never sends / or /dashboard to the backend, which has its own routes there", async () => {
    const sources = (await rewrites()).map((r) => r.source);
    expect(sources).not.toContain("/");
    expect(sources).not.toContain("/dashboard");
  });
});
