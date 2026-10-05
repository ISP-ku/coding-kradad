import { describe, expect, it } from "vitest";
import { makePreviewUser, previewFaq, previewHomeworks } from "./preview";

describe("makePreviewUser", () => {
  it("builds a KU Google preview account without Classroom access", () => {
    const user = makePreviewUser();
    expect(user.provider).toBe("google");
    expect(user.email).toBe("teststudent@ku.th");
    expect(user.classroom_courses).toBeUndefined();
  });
});

describe("preview fixtures", () => {
  it("exposes at least one FAQ entry with the expected shape", () => {
    expect(previewFaq.length).toBeGreaterThan(0);
    for (const entry of previewFaq) {
      expect(typeof entry.question).toBe("string");
      expect(typeof entry.status).toBe("string");
      expect(Array.isArray(entry.tags)).toBe(true);
    }
  });

  it("exposes at least one homework entry with the expected shape", () => {
    expect(previewHomeworks.length).toBeGreaterThan(0);
    for (const hw of previewHomeworks) {
      expect(typeof hw.student).toBe("string");
      expect(typeof hw.assignment).toBe("string");
      expect(typeof hw.status).toBe("string");
    }
  });
});
