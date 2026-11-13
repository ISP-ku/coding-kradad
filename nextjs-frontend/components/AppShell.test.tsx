import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/types";
import AppShell from "./AppShell";

const baseUser: SessionUser = {
  id: "42",
  username: "Alice",
  provider: "google",
};

function renderShell(
  viewer: SessionUser | null,
  page: "dashboard" | "faq" | "reports" = "dashboard",
) {
  return render(
    <AppShell
      page={page}
      title="Dashboard"
      heading="Welcome to your course dashboard"
      subtitle="Stay connected with your learning."
      viewer={viewer}
      logoutHref="/preview-logout"
    >
      <p>page content</p>
    </AppShell>,
  );
}

describe("AppShell (signed out)", () => {
  it("shows the signed-out sidebar and a sign-in link instead of an account menu", () => {
    renderShell(null);

    expect(screen.getAllByText("Course Support").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sign in to continue").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /my account/i })).not.toBeInTheDocument();
  });

  it("links the Dashboard nav item to / when there's no viewer", () => {
    renderShell(null);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/");
  });
});

describe("AppShell (signed in)", () => {
  it("shows the viewer's name in the sidebar", () => {
    renderShell(baseUser);

    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getByText("Signed in")).toBeInTheDocument();
  });

  it("labels the signed-in person by their actual role, not just 'Student'", () => {
    const { unmount } = renderShell({ ...baseUser, role: "ta" });
    expect(screen.getByText("Teaching assistant")).toBeInTheDocument();
    unmount();

    renderShell({ ...baseUser, role: "lecturer" });
    expect(screen.getByText("Lecturer")).toBeInTheDocument();
  });

  it("marks the current page's nav link as active", () => {
    renderShell({ ...baseUser, role: "ta" }, "faq");
    expect(screen.getByRole("link", { name: /faq/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });

  it("shows a Reports nav link only for a Lecturer (SRS-18, SRS-19)", () => {
    renderShell(null);
    expect(screen.queryByRole("link", { name: /reports/i })).not.toBeInTheDocument();

    renderShell(baseUser); // signed in, but no role
    expect(screen.queryByRole("link", { name: /reports/i })).not.toBeInTheDocument();

    renderShell({ ...baseUser, role: "ta" });
    expect(screen.queryByRole("link", { name: /reports/i })).not.toBeInTheDocument();

    renderShell({ ...baseUser, role: "lecturer" });
    expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/reports");
  });

  it("shows each role only the pages it may use (R-02, SRS-18)", () => {
    const links = (viewer: SessionUser | null) => {
      const { unmount } = renderShell(viewer);
      const names = ["dashboard", "faq", "homework", "consultation", "reports", "access"].filter(
        (n) => screen.queryByRole("link", { name: new RegExp(n, "i") }),
      );
      unmount();
      return names;
    };
    expect(links({ ...baseUser, role: "student" })).toEqual(["faq", "homework"]);
    expect(links(baseUser)).toEqual(["faq", "homework"]); // no role = student
    expect(links({ ...baseUser, role: "ta" })).toEqual(["dashboard", "faq", "homework", "consultation"]);
    expect(links({ ...baseUser, role: "lecturer" })).toEqual(["dashboard", "faq", "homework", "reports", "access"]);
  });

  it("offers the Light / Dark theme switch", () => {
    renderShell(baseUser);
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });

  it("points the logout link at logoutHref", () => {
    renderShell(baseUser);
    expect(screen.getByRole("link", { name: /log out/i })).toHaveAttribute("href", "/preview-logout");
  });

  it("opens the account dialog with the viewer's details, falling back to 'Not provided'", async () => {
    renderShell(baseUser);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /my account/i }));

    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveAttribute("open");
    // student ID and email are both unset on baseUser, so "Not provided" appears twice
    expect(screen.getAllByText("Not provided")).toHaveLength(2);
    expect(screen.getAllByText("Google").length).toBeGreaterThan(0);
  });

  it("lists Google Classroom courses in the account dialog when present", async () => {
    renderShell({
      ...baseUser,
      provider: "google",
      classroom_courses: [{ name: "Intro to Databases" }],
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /my account/i }));

    expect(screen.getByText("Intro to Databases")).toBeInTheDocument();
  });
});
