import { describe, expect, it } from "vitest";
import { byDueDate, errorMessage, localInputToIso } from "./homework";
import type { HomeworkItem } from "./types";

const item = (id: number, due: string) => ({ id, due_at: due }) as HomeworkItem;

describe("homework helpers", () => {
  it("sorts by due date, then id", () => {
    const list = [item(3, "2026-02-01T00:00:00Z"), item(1, "2026-03-01T00:00:00Z"), item(2, "2026-02-01T00:00:00Z")];
    expect(list.sort(byDueDate).map((h) => h.id)).toEqual([2, 3, 1]);
  });

  it("converts local input to a UTC instant and rejects junk", () => {
    expect(localInputToIso("2099-03-01T09:30")).toBe(new Date("2099-03-01T09:30").toISOString());
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("nonsense")).toBeNull();
  });

  it("prefers the backend's message, falls back otherwise, and never shows validation arrays", async () => {
    expect(await errorMessage(new Response(JSON.stringify({ detail: "Score cannot be more than 20." }), { status: 422 }), "fb")).toBe("Score cannot be more than 20.");
    expect(await errorMessage(new Response(JSON.stringify({ detail: [{ msg: "x" }] }), { status: 422 }), "fb")).toBe("fb");
    expect(await errorMessage(new Response("<html>", { status: 500 }), "fb")).toBe("fb");
    expect(await errorMessage(new Response("{}", { status: 401 }), "fb")).toMatch(/session has ended/);
    expect(await errorMessage(new Response("{}", { status: 403 }), "fb")).toMatch(/not allowed/);
  });
});
