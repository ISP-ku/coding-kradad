import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/components/AppShell", () => ({ default: () => null }));
vi.mock("@/components/ConsultationForm", () => ({ default: () => null }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function open(user: unknown) {
  vi.resetModules();
  vi.stubEnv("UI_PREVIEW", "0");
  mocks.getSessionUser.mockResolvedValue(user);
  const { default: Page } = await import("./page");
  return Page();
}
const account = (role?: string) => ({ id: "1", username: "X", provider: "google", role });

describe("Record-consultation route guard (SRS-14)", () => {
  it("sends signed-out visitors to the consultation page's sign-in prompt", async () => {
    await expect(open(null)).rejects.toThrow("REDIRECT:/consultations");
  });
  it("keeps students out", async () => {
    await expect(open(account("student"))).rejects.toThrow("REDIRECT:/homework");
  });
  it("keeps lecturers out - only TAs record consultations", async () => {
    await expect(open(account("lecturer"))).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("lets a TA in", async () => {
    await expect(open(account("ta"))).resolves.toBeTruthy();
  });
});
