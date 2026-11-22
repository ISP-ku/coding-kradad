import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("prefers the backend's message, falls back otherwise, and never shows validation arrays", async () => {
    expect(await errorMessage(new Response(JSON.stringify({ detail: "Score cannot be more than 20." }), { status: 422 }), "fb")).toBe("Score cannot be more than 20.");
    expect(await errorMessage(new Response(JSON.stringify({ detail: [{ msg: "x" }] }), { status: 422 }), "fb")).toBe("fb");
    expect(await errorMessage(new Response("<html>", { status: 500 }), "fb")).toBe("fb");
    expect(await errorMessage(new Response("{}", { status: 401 }), "fb")).toMatch(/session has ended/);
    expect(await errorMessage(new Response("{}", { status: 403 }), "fb")).toMatch(/not allowed/);
  });
});
