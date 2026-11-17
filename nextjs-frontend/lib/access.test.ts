import { describe, expect, it } from "vitest";
import { normaliseKuEmail } from "./access";

describe("normaliseKuEmail", () => {
  it("accepts KU addresses, trimmed and lower-cased", () => {
    expect(normaliseKuEmail("  Name.S@KU.th ")).toBe("name.s@ku.th");
  });
  it.each(["a@gmail.com", "a@kuxth", "a@ku.th.evil.com", "a b@ku.th", "@ku.th"])("refuses %s by default", (raw) => {
    expect(normaliseKuEmail(raw)).toBeNull();
  });
  it("accepts Gmail only when personal accounts are allowed", () => {
    expect(normaliseKuEmail("Some.One@Gmail.com", true)).toBe("some.one@gmail.com");
    expect(normaliseKuEmail("a@outlook.com", true)).toBeNull();
    expect(normaliseKuEmail("a@gmailxcom", true)).toBeNull();
  });
});
