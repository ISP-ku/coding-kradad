import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PasswordSignIn from "./PasswordSignIn";

const API = "http://localhost:8000";

describe("PasswordSignIn", () => {
  it("posts the address and password to the backend", () => {
    render(<PasswordSignIn apiBase={API} />);
    const form = screen.getByRole("form", { name: "Sign in with a password" });
    expect(form).toHaveAttribute("action", `${API}/password-login`);
    expect(form).toHaveAttribute("method", "post");
    expect(within(form).getByLabelText("Email address")).toHaveAttribute("name", "email");
    const password = within(form).getByLabelText("Password");
    expect(password).toHaveAttribute("name", "password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(within(form).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("keeps the address after a failed try", () => {
    render(<PasswordSignIn apiBase={API} email="a@ku.th" error="wrong" />);
    expect(screen.getByLabelText("Email address")).toHaveValue("a@ku.th");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("explains a bad address", () => {
    render(<PasswordSignIn apiBase={API} email="x@gmail.com" error="invalid_email" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your KU email address, ending in @ku.th.");
  });

  it("mentions Gmail when personal accounts are allowed", () => {
    render(<PasswordSignIn apiBase={API} error="invalid_email" allowPersonal />);
    expect(screen.getByRole("alert")).toHaveTextContent("@ku.th, or the Gmail address your lecturer added");
  });

  it.each([
    ["wrong", "That email and password do not match."],
    ["locked", "Too many wrong tries. Wait 15 minutes, or ask your lecturer for a new password."],
    ["denied", "This account is not registered in any course. Ask a lecturer to add you."],
  ])("explains %s", (error, text) => {
    render(<PasswordSignIn apiBase={API} email="a@ku.th" error={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });
});
