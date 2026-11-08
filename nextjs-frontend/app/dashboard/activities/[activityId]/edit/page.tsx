import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ActivityEditForm from "@/components/ActivityEditForm";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { CourseActivity } from "@/lib/types";
import styles from "../../new/page.module.css";

export const metadata: Metadata = { title: "Edit activity · Course Support" };

export default async function EditActivityPage({ params }: { params: { activityId: string } }) {
  if (PREVIEW) redirect("/");
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "lecturer") redirect("/dashboard");

  const activityId = Number(params.activityId);
  if (!Number.isSafeInteger(activityId) || activityId <= 0) notFound();
  const cookieHeader = cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");

  let activity: CourseActivity | null = null;
  try {
    const response = await fetch(`${API_BASE}/api/activities/${activityId}`, {
      headers: { cookie: cookieHeader }, cache: "no-store",
    });
    if (response.status === 404 || response.status === 409) notFound();
    if (response.ok) activity = (await response.json()) as CourseActivity;
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
  }

  return <AppShell
    page="dashboard"
    title="Edit activity"
    heading="Edit course activity"
    subtitle="Update the activity details without changing its task assignments."
    viewer={user}
    logoutHref={logoutUrl}
  >
    <div className={styles.page}>
      <a className={styles.backLink} href="/dashboard">← Back to dashboard</a>
      {activity ? <ActivityEditForm activity={activity} /> : (
        <p role="alert">Could not load this activity. Check the backend connection and try again.</p>
      )}
    </div>
  </AppShell>;
}
