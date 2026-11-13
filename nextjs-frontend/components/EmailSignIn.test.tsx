import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EmailSignIn from "./EmailSignIn";

const API = "http://localhost:8000";

describe("EmailSignIn, step 1", () => {
  it("asks for the address and posts it to the backend", () => {
    render(<EmailSignIn apiBase={API} />);
    const form = screen.getByRole("form", { name: "Get a sign-in code" });
    expect(form).toHaveAttribute("action", `${API}/email-login/request`);
    expect(form).toHaveAttribute("method", "post");
    expect(within(form).getByLabelText("Email address")).toHaveAttribute("name", "email");
    expect(within(form).getByRole("button", { name: "Email me a code" })).toBeInTheDocument();
  });

  it("explains a bad address", () => {
    render(<EmailSignIn apiBase={API} email="x@gmail.com" error="invalid_email" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your KU email address, ending in @ku.th.");
    expect(screen.getByLabelText("Email address")).toHaveValue("x@gmail.com");
  });

  it("mentions Gmail when personal accounts are allowed", () => {
    render(<EmailSignIn apiBase={API} error="invalid_email" allowPersonal />);
    expect(screen.getByRole("alert")).toHaveTextContent("@ku.th, or the Gmail address your lecturer added");
  });

  it("says when email sign-in is not set up", () => {
    render(<EmailSignIn apiBase={API} email="a@ku.th" error="unavailable" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/not set up on this server/);
  });
});

describe("EmailSignIn, step 2", () => {
  it("asks for the code, keeping the address", () => {
    render(<EmailSignIn apiBase={API} email="a@ku.th" sent />);
    expect(screen.getByRole("status")).toHaveTextContent("If a@ku.th can sign in, we've sent a 6-digit code to it.");
    const form = screen.getByRole("form", { name: "Enter your code" });
    expect(form).toHaveAttribute("action", `${API}/email-login/verify`);
    const code = within(form).getByLabelText("6-digit code");
    expect(code).toHaveAttribute("name", "code");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(form.querySelector('input[type="hidden"][name="email"]')).toHaveValue("a@ku.th");
    expect(within(form).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("offers a new code and a different address", () => {
    render(<EmailSignIn apiBase={API} email="a@ku.th" sent />);
    const resend = screen.getByRole("form", { name: "Send a new code" });
    expect(resend).toHaveAttribute("action", `${API}/email-login/request`);
    expect(resend.querySelector('input[name="email"]')).toHaveValue("a@ku.th");
    expect(screen.getByRole("link", { name: "Use a different email" })).toHaveAttribute("href", "/sign-in/email");
  });

  it.each([
    ["wrong", "That code is not right. Check the email and try again."],
    ["expired", "This code has expired or was already used. Send a new one."],
    ["locked", "Too many wrong tries. Send a new code."],
    ["wait", "A code was sent a moment ago. Wait a minute before asking for another."],
    ["denied", "This account is not registered in any course. Ask a lecturer to add you."],
    ["send_failed", "The email could not be sent. Please try again in a moment."],
  ])("explains %s", (error, text) => {
    render(<EmailSignIn apiBase={API} email="a@ku.th" sent={error !== "denied" && error !== "send_failed"} error={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });
});
