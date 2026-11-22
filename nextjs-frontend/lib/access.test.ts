import { describe, expect, it } from "vitest";
import { addedNotice, isKuEmail, normaliseMemberEmail } from "./access";

describe("normaliseMemberEmail", () => {
  it.each([
    ["  Name.S@KU.th ", "name.s@ku.th"],
    ["Out.Sider@Example.COM", "out.sider@example.com"],
    ["Some.One@Gmail.com", "some.one@gmail.com"],
    ["first.last@student.mahidol.ac.th", "first.last@student.mahidol.ac.th"],
  ])("accepts %s", (raw, expected) => {
    expect(normaliseMemberEmail(raw)).toBe(expected);
  });

  // Same rule as the backend's normalise_member_email.
  it.each(["", "not-an-email", "a@b", "a@b.", "a@.com", "a b@x.com", "a@@x.com", "@x.com", "a@x..com", `${"a".repeat(195)}@x.com`])(
    "refuses %j", (raw) => {
      expect(normaliseMemberEmail(raw)).toBeNull();
    });
});

describe("isKuEmail", () => {
  it("is true only for @ku.th itself", () => {
    expect(isKuEmail("a@ku.th")).toBe(true);
    expect(isKuEmail("a@ku.th.evil.com")).toBe(false);
    expect(isKuEmail("a@example.com")).toBe(false);
  });
});

describe("addedNotice", () => {
  it("confirms a KU address", () => {
    expect(addedNotice("nida@ku.th", "CS101")).toBe("nida@ku.th now has access to CS101.");
  });

  it("tells the lecturer to create a password for anyone else", () => {
    expect(addedNotice("out@example.com", "CS101")).toBe(
      "out@example.com now has access to CS101. Without a @ku.th address they can only sign in with a password: "
      + "click Create password next to their name.",
    );
  });

  it("works without a course", () => {
    expect(addedNotice("nida@ku.th")).toBe("nida@ku.th now has access.");
  });
});
