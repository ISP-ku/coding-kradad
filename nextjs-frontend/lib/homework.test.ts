import { describe, expect, it } from "vitest";
import { localInputToIso } from "./homework";

describe("homework helpers", () => {
  it("converts local input to a UTC instant and rejects junk", () => {
    expect(localInputToIso("2099-03-01T09:30")).toBe(new Date("2099-03-01T09:30").toISOString());
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("nonsense")).toBeNull();
  });
});
