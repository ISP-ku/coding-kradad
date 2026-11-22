import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityReport, ReportActivity } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getReportCourses: vi.fn(),
  getActivityReport: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/reports", () => ({ getReportCourses: mocks.getReportCourses, getActivityReport: mocks.getActivityReport }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

const LECTURER = { id: "1", username: "L", provider: "google", role: "lecturer" };

const activity = (over: Partial<ReportActivity>): ReportActivity => ({
  id: 1, title: "Lab 1", type: "lab", starts_at: "2026-11-01T02:00:00Z", location: "Room 204",
  created_by: "google:1", archived_at: null, tasks: [], ...over,
});
const task = (id: number, status: string) => ({
  id, assignee_id: "google:ta", status, assigned_at: "2026-10-30T00:00:00Z", status_changed_at: null,
});
const report = (over: Partial<ActivityReport> = {}): ActivityReport => ({
  course_id: "CS101", start_date: "2026-10-01", end_date: "2026-11-30", has_records: true,
  activity_count: 3, status_summary: { Done: 2, "In Progress": 1 },
  activities: [
    activity({ id: 1, title: "Archived lab", archived_at: "2026-11-02T00:00:00Z", tasks: [task(1, "In Progress")] }),
    activity({ id: 2, title: "Finished deadline", type: "deadline", tasks: [task(2, "Done"), task(3, "Done")] }),
    activity({ id: 3, title: "Past milestone", type: "milestone" }),
  ],
  consultations: { count: 2, total_minutes: 75, scope: "all_courses" },
  ...over,
});

afterEach(() => vi.clearAllMocks());

async function open(user: unknown, searchParams = {}) {
  mocks.getSessionUser.mockResolvedValue(user);
  const { default: ReportsPage } = await import("./page");
  render(await ReportsPage({ searchParams }));
}

describe("Reports page", () => {
  it("sends signed-out visitors to sign in", async () => {
    await expect(open(null)).rejects.toThrow("REDIRECT:/");
  });

  it.each(["ta", "student"])("tells a %s it is for lecturers, without loading anything", async (role) => {
    await open({ ...LECTURER, role });
    expect(screen.getByRole("heading", { name: "Lecturer access required" })).toBeInTheDocument();
    expect(mocks.getReportCourses).not.toHaveBeenCalled();
  });

  it("explains when no course has activities yet", async () => {
    mocks.getReportCourses.mockResolvedValue([]);
    await open(LECTURER);
    expect(screen.getByRole("heading", { name: "No course selected" })).toBeInTheDocument();
    expect(screen.getByLabelText("Course")).toHaveAttribute("placeholder", "Course id");
    expect(mocks.getActivityReport).not.toHaveBeenCalled();
  });

  it("opens on the first course, and says when nothing matches", async () => {
    mocks.getReportCourses.mockResolvedValue(["CS101", "CS202"]);
    mocks.getActivityReport.mockResolvedValue(report({ has_records: false }));
    await open(LECTURER);
    expect(screen.getByLabelText("Course")).toHaveValue("CS101");
    expect(mocks.getActivityReport).toHaveBeenCalledWith("CS101", expect.any(String), expect.any(String));
    expect(screen.getByRole("heading", { name: "No records found" })).toBeInTheDocument();
  });

  it("uses the course and dates from the address", async () => {
    mocks.getReportCourses.mockResolvedValue(["CS101", "CS202"]);
    mocks.getActivityReport.mockResolvedValue(null);
    await open(LECTURER, { course_id: "CS202", start_date: "2026-01-01", end_date: "2026-02-01" });
    expect(mocks.getActivityReport).toHaveBeenCalledWith("CS202", "2026-01-01", "2026-02-01");
    expect(screen.getByLabelText("From")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-02-01");
    expect(screen.getByRole("heading", { name: "No records found" })).toBeInTheDocument();
  });

  it("shows the summary and one row per activity", async () => {
    mocks.getReportCourses.mockResolvedValue(["CS101"]);
    mocks.getActivityReport.mockResolvedValue(report());
    await open(LECTURER);

    expect(screen.getByText("3 activities")).toBeInTheDocument();
    expect(screen.getByText("2 Done")).toBeInTheDocument();
    expect(screen.getByText("1 In Progress")).toBeInTheDocument();
    expect(screen.getByText(/2 consultations · 75 min support load \(all courses\)/)).toBeInTheDocument();

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Archived lab (archived)");
    expect(rows[1]).toHaveTextContent("Finished deadline (completed)");
    expect(within(rows[1]).getAllByText("Done")).toHaveLength(2);
    expect(rows[2]).toHaveTextContent("Past milestone");
    expect(rows[2]).not.toHaveTextContent("(completed)");
    expect(within(rows[2]).getByText("Unassigned")).toBeInTheDocument();
  });

  it("uses the singular for one activity and one consultation", async () => {
    mocks.getReportCourses.mockResolvedValue(["CS101"]);
    mocks.getActivityReport.mockResolvedValue(report({
      activity_count: 1, activities: [activity({})], status_summary: {},
      consultations: { count: 1, total_minutes: 30, scope: "all_courses" },
    }));
    await open(LECTURER);
    expect(screen.getByText("1 activity")).toBeInTheDocument();
    expect(screen.getByText(/1 consultation · 30 min/)).toBeInTheDocument();
  });

  it("leaves out the support load when there were no consultations", async () => {
    mocks.getReportCourses.mockResolvedValue(["CS101"]);
    mocks.getActivityReport.mockResolvedValue(report({ consultations: { count: 0, total_minutes: 0, scope: "all_courses" } }));
    await open(LECTURER);
    expect(screen.queryByText(/support load/)).not.toBeInTheDocument();
  });
});
