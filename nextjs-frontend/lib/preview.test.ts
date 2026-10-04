import { describe, expect, it } from "vitest";
import { makePreviewUser, previewFaq, previewHomeworks } from "./preview";

describe("makePreviewUser", () => {
  it("builds a discord preview user with no email or courses", () => {
    const user = makePreviewUser("discord");
    expect(user.provider).toBe("discord");
    expect(user.username).toBe("TestStudent");
    expect(user.email).toBeUndefined();
    expect(user.classroom_courses).toBeUndefined();
  });

  it("builds a google preview user with an email and classroom courses", () => {
    const user = makePreviewUser("google");
    expect(user.provider).toBe("google");
    expect(user.email).toBe("teststudent@example.com");
    expect(user.classroom_courses).toEqual([
      { name: "Intro to Databases" },
      { name: "Software Engineering Lab" },
    ]);
  });

  it("builds a line preview user with no email or courses", () => {
    const user = makePreviewUser("line");
    expect(user.provider).toBe("line");
    expect(user.email).toBeUndefined();
    expect(user.classroom_courses).toBeUndefined();
  });

  it("falls back to discord for an unknown provider", () => {
    const user = makePreviewUser("not-a-real-provider");
    expect(user.provider).toBe("discord");
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
