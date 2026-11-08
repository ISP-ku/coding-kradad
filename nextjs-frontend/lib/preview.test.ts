import { describe, expect, it } from "vitest";
import { makePreviewReport, makePreviewUser, previewReportCourses, previewTopicDetail, previewTopics } from "./preview";

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
  it("exposes at least one topic with the expected shape", () => {
    expect(previewTopics.length).toBeGreaterThan(0);
    for (const topic of previewTopics) {
      expect(typeof topic.title).toBe("string");
      expect(typeof topic.description).toBe("string");
      expect(typeof topic.status).toBe("string");
      expect(typeof topic.comment_count).toBe("number");
      expect(typeof topic.saved).toBe("boolean");
    }
  });

  it("builds a topic detail with its comment thread", () => {
    const detail = previewTopicDetail(previewTopics[0].id);
    expect(detail).not.toBeNull();
    expect(Array.isArray(detail?.comments)).toBe(true);
  });

  it("returns null for an unknown topic id", () => {
    expect(previewTopicDetail(999999)).toBeNull();
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
