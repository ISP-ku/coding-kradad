import { describe, expect, it } from "vitest";
import { daysFromNow, localDate, localDateTime, localTime } from "./dates";

// Built from local parts, so these pass in any time zone.
const at = new Date(2026, 0, 5, 9, 7); // 5 Jan 2026, 09:07 local

describe("date helpers", () => {
  it("formats a local date with zero padding", () => {
    expect(localDate(at)).toBe("2026-01-05");
  });

  it("formats a local time with zero padding", () => {
    expect(localTime(at)).toBe("09:07");
  });

  it("joins date and time for datetime-local inputs", () => {
    expect(localDateTime(at)).toBe("2026-01-05T09:07");
  });

  it("moves forward and back by whole days, across month and year ends", () => {
    expect(localDate(daysFromNow(1, at))).toBe("2026-01-06");
    expect(localDate(daysFromNow(-5, at))).toBe("2025-12-31");
    expect(localDate(daysFromNow(27, at))).toBe("2026-02-01");
  });

  it("does not change the date it starts from", () => {
    daysFromNow(3, at);
    expect(localDate(at)).toBe("2026-01-05");
  });
});
