import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/components/AppShell", () => ({ default: () => null }));
vi.mock("@/components/ActivityWorkspace", () => ({ default: () => null }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function openDashboard(user: unknown) {
  vi.resetModules();
  vi.stubEnv("UI_PREVIEW", "0");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  mocks.getSessionUser.mockResolvedValue(user);
  const { default: DashboardPage } = await import("./page");
  return DashboardPage({ searchParams: {} });
}

describe("Dashboard route guard (R-02)", () => {
  it("sends signed-out visitors to the sign-in page", async () => {
    await expect(openDashboard(null)).rejects.toThrow("REDIRECT:/");
  });
  it("sends students to their homework instead of the dashboard", async () => {
    await expect(openDashboard({ id: "1", username: "S", provider: "google", role: "student" }))
      .rejects.toThrow("REDIRECT:/homework");
  });
  it("treats a user with no role as a student", async () => {
    await expect(openDashboard({ id: "1", username: "S", provider: "google" })).rejects.toThrow("REDIRECT:/homework");
  });
  it.each(["ta", "lecturer"])("lets a %s open the dashboard", async (role) => {
    await expect(openDashboard({ id: "1", username: "X", provider: "google", role })).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not load any activity data for a student", async () => {
    await expect(openDashboard({ id: "1", username: "S", provider: "google", role: "student" })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
