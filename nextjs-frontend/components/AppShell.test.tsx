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

function renderShell(viewer: SessionUser | null, page: "dashboard" | "faq" | "homework" = "dashboard") {
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

    expect(screen.getByText("Course Support")).toBeInTheDocument();
    expect(screen.getAllByText("Student portal").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /my account/i })).not.toBeInTheDocument();
  });

  it("links the dashboard nav item to / when there's no viewer", () => {
    renderShell(null);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/");
  });
});

describe("AppShell (signed in)", () => {
  it("shows the viewer's name and provider in the sidebar and app bar", () => {
    renderShell(baseUser);

    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getByText("Google account")).toBeInTheDocument();
  });

  it("marks the current page's nav link as active", () => {
    renderShell(baseUser, "faq");
    expect(screen.getByRole("link", { name: /faq/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
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
