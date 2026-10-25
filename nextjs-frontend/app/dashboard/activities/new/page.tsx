import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ActivityCreateForm from "@/components/ActivityCreateForm";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { ActivityAssignee } from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Add activity · Course Support" };

async function loadAssignees(): Promise<ActivityAssignee[]> {
  const cookieHeader = cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  try {
    const response = await fetch(`${API_BASE}/api/activities/assignees`, { headers: { cookie: cookieHeader }, cache: "no-store" });
    return response.ok ? (await response.json()) as ActivityAssignee[] : [];
  } catch { return []; }
}

export default async function NewActivityPage() {
  if (PREVIEW) redirect("/");
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "lecturer") redirect("/dashboard");
  const assignees = await loadAssignees();
  return <AppShell page="dashboard" title="Add activity" heading="Create a course activity" subtitle="Add complete details and assign responsibility." viewer={user} logoutHref={logoutUrl}>
    <div className={styles.page}>
      <a className={styles.backLink} href="/dashboard">← Back to dashboard</a>
      <ActivityCreateForm assignees={assignees} />
    </div>
  </AppShell>;
}
