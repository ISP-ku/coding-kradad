import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ActivityForm from "@/components/ActivityForm";
import ui from "@/components/ui.module.css";
import { logoutUrl } from "@/lib/api";
import { backendJson } from "@/lib/backend";
import { PREVIEW } from "@/lib/preview";
import { canAccess, homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import type { ActivityAssignee } from "@/lib/types";

export const metadata: Metadata = { title: "Add activity · Course Support" };

async function loadAssignees(): Promise<ActivityAssignee[]> {
  return (await backendJson<ActivityAssignee[]>("/api/activities/assignees")) ?? [];
}

/** Course codes to suggest: courses on the Access page plus any already used by activities. */
async function loadCourseCodes(): Promise<string[]> {
  const [access, used] = await Promise.all([
    backendJson<{ courses: { code: string }[] }>("/api/access"),
    backendJson<string[]>("/api/reports/courses"),
  ]);
  const codes = [...(access?.courses ?? []).map((c) => c.code), ...(used ?? [])];
  return Array.from(new Set(codes)).sort();
}

export default async function NewActivityPage() {
  if (PREVIEW) redirect("/");
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!canAccess(user, "addActivity")) redirect(homePathFor(user));
  const [assignees, courses] = await Promise.all([loadAssignees(), loadCourseCodes()]);
  return <AppShell page="dashboard" title="Add activity" heading="Add an activity" subtitle="Put it on the course schedule and give it to a TA." viewer={user} logoutHref={logoutUrl}>
    <div className={ui.formPage}>
      <a className={ui.backLink} href="/dashboard">← Back to dashboard</a>
      <ActivityForm mode="create" assignees={assignees} courses={courses} />
    </div>
  </AppShell>;
}
