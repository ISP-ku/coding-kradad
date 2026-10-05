import { describe, expect, it } from "vitest";
import { makePreviewReport, makePreviewUser, previewFaq, previewHomeworks, previewReportCourses } from "./preview";

describe("makePreviewUser", () => {
  it("builds a KU Google preview account without Classroom access", () => {
    const user = makePreviewUser();
    expect(user.provider).toBe("google");
    expect(user.email).toBe("teststudent@ku.th");
    expect(user.classroom_courses).toBeUndefined();
  });

  it("is a lecturer so every page, including Reports, can be previewed", () => {
    expect(makePreviewUser().role).toBe("lecturer");
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

describe("makePreviewReport", () => {
  it("echoes back the requested course id and has records", () => {
    const report = makePreviewReport("course-1");
    expect(report.course_id).toBe("course-1");
    expect(report.has_records).toBe(true);
    expect(report.activity_count).toBe(report.activities.length);
  });

  it("every activity has at least one task and a type", () => {
    const report = makePreviewReport("course-1");
    for (const activity of report.activities) {
      expect(typeof activity.type).toBe("string");
      expect(activity.tasks.length).toBeGreaterThan(0);
    }
  });

  it("offers at least one course for the picker", () => {
    expect(previewReportCourses.length).toBeGreaterThan(0);
  });
});
