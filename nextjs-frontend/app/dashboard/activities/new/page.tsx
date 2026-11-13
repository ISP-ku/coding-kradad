import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ActivityForm from "@/components/ActivityForm";
import ui from "@/components/ui.module.css";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import { canAccess, homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import type { ActivityAssignee } from "@/lib/types";

export const metadata: Metadata = { title: "Add activity · Course Support" };

async function loadAssignees(): Promise<ActivityAssignee[]> {
  const cookieHeader = cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  try {
    const response = await fetch(`${API_BASE}/api/activities/assignees`, { headers: { cookie: cookieHeader }, cache: "no-store" });
    return response.ok ? (await response.json()) as ActivityAssignee[] : [];
  } catch { return []; }
}

/** Course codes to suggest: courses on the Access page plus any already used by activities. */
async function loadCourseCodes(): Promise<string[]> {
  const cookieHeader = cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  const get = async (path: string) => {
    try {
      const response = await fetch(`${API_BASE}${path}`, { headers: { cookie: cookieHeader }, cache: "no-store" });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  };
  const [access, used] = await Promise.all([get("/api/access"), get("/api/reports/courses")]);
  const codes = [...((access?.courses ?? []) as { code: string }[]).map((c) => c.code), ...((used ?? []) as string[])];
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
