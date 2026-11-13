import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: () => ({ getAll: () => [{ name: "ku_session", value: "abc" }] }) }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/components/AppShell", () => ({ default: () => null }));
vi.mock("@/components/HomeworkStudent", () => ({ default: () => null }));
vi.mock("@/components/HomeworkStaff", () => ({ default: () => null }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function open(user: unknown, response: Response | Error = new Response("[]")) {
  vi.resetModules();
  vi.stubEnv("UI_PREVIEW", "0");
  const fetcher = vi.fn().mockImplementation(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  vi.stubGlobal("fetch", fetcher);
  mocks.getSessionUser.mockResolvedValue(user);
  const { default: Page } = await import("./page");
  const element = (await Page({ searchParams: {} })) as { props: { heading: string; children: Array<{ type?: { name?: string }; props?: Record<string, unknown> } | false> } };
  return { element, fetcher, views: element.props.children.filter(Boolean) as Array<{ type: unknown; props: Record<string, unknown> }> };
}
const account = (role?: string) => ({ id: "1", username: "X", provider: "google", role });

describe("Homework page", () => {
  it("sends signed-out visitors to sign in", async () => {
    await expect(open(null)).rejects.toThrow("REDIRECT:/");
  });

  it("gives students the student view, with the session cookie forwarded", async () => {
    const { element, views, fetcher } = await open(account("student"));
    expect(element.props.heading).toBe("Homework");
    expect(views).toHaveLength(1);
    expect(views[0].props.initial).toEqual([]);
    expect(views[0].props.role).toBeUndefined();
    expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/homework$/);
    expect(fetcher.mock.calls[0][1].headers.cookie).toBe("ku_session=abc");
  });

  it("treats an account with no role as a student", async () => {
    const { element, views } = await open(account(undefined));
    expect(element.props.heading).toBe("Homework");
    expect(views[0].props.role).toBeUndefined();
  });

  it.each([["ta", "Homework to grade"], ["lecturer", "Assign and track homework"]])("gives a %s the staff view", async (role, heading) => {
    const { element, views } = await open(account(role));
    expect(element.props.heading).toBe(heading);
    expect(views[0].props.role).toBe(role);
  });

  it.each([new Response("{}", { status: 500 }), new Error("down")])("shows an error instead of an empty list when loading fails", async (failure) => {
    const { element } = await open(account("student"), failure);
    const children = element.props.children as unknown[];
    expect(children.some((c) => c && (c as { type?: string }).type === "p")).toBe(true);
    expect(children.filter((c) => c && typeof (c as { type: unknown }).type === "function")).toHaveLength(0);
  });
});
