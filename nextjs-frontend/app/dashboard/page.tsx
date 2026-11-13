import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ActivityWorkspace from "@/components/ActivityWorkspace";
import WaitingPanel, { waitingItems } from "@/components/WaitingPanel";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import { canAccess, homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import type { CourseActivity, HomeworkItem, Topic } from "@/lib/types";
import styles from "./page.module.css";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Dashboard · Course Support" };

const WEEK = 7 * 24 * 60 * 60 * 1000;

async function getJson<T>(path: string, cookieHeader: string): Promise<{ data: T | null; detail: string }> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { headers: { cookie: cookieHeader }, cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { data: null, detail: body.detail ?? "" };
    }
    return { data: (await response.json()) as T, detail: "" };
  } catch {
    return { data: null, detail: "" };
  }
}

/** "1 overdue and 2 due in the next 7 days", counted over the tasks this person is looking at first. */
function summarise(activities: CourseActivity[], role: string, viewerId: string): string {
  const now = Date.now();
  const tasks = activities.flatMap((a) => a.tasks.map((t) => ({ a, t })))
    .filter(({ t }) => role !== "ta" || t.assignee_id === viewerId);
  const overdue = tasks.filter(({ t }) => t.is_overdue).length;
  const soon = tasks.filter(({ a, t }) => !t.is_overdue && new Date(a.starts_at).getTime() <= now + WEEK).length;
  const parts = [overdue && `${overdue} overdue`, soon && `${soon} due in the next 7 days`].filter(Boolean);
  if (!parts.length) return role === "ta" ? "Nothing of yours is overdue or due this week." : "Nothing is overdue or due this week.";
  return `${role === "ta" ? "Your list has" : "The course has"} ${parts.join(" and ")}.`;
}

export default async function DashboardPage() {
  if (PREVIEW) redirect("/");
  const user = await getSessionUser();
  if (!user) redirect("/");
  // R-02: students have no dashboard; the API also refuses them (403).
  if (!canAccess(user, "dashboard")) redirect(homePathFor(user));

  const role = user.role === "lecturer" ? "lecturer" : "ta";
  const cookieHeader = cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  const [activityResult, homeworkResult, pendingResult] = await Promise.all([
    getJson<CourseActivity[]>("/api/activities", cookieHeader),
    getJson<HomeworkItem[]>("/api/homework", cookieHeader),
    role === "lecturer" ? getJson<Topic[]>("/api/faq/pending", cookieHeader) : Promise.resolve({ data: [] as Topic[], detail: "" }),
  ]);
  const activities = activityResult.data ?? [];
  const activityError = activityResult.data
    ? ""
    : activityResult.detail || "Activities could not be loaded. Start the backend and refresh this page.";
  const viewerId = `${user.provider}:${user.id}`;
  const firstName = (user.username || "").split(" ")[0] || "there";

  return (
    <AppShell
      page="dashboard"
      title="Dashboard"
      heading={`Hello, ${firstName}`}
      subtitle={activityResult.data ? summarise(activities, role, viewerId) : "Here is what needs you, sorted by how soon it is due."}
      viewer={user}
      logoutHref={logoutUrl}
      actions={role === "lecturer" ? (
        <a className={ui.actionButton} href="/dashboard/activities/new">
          <Icon name="plus" /> Add activity
        </a>
      ) : undefined}
    >
      <div className={styles.columns}>
        <div className={styles.main}>
          <ActivityWorkspace
            initialActivities={activities}
            initialError={activityError}
            viewerRole={user.role ?? "student"}
            viewerId={viewerId}
          />
        </div>
        <aside className={styles.side}>
          <WaitingPanel items={waitingItems(role, homeworkResult.data ?? [], pendingResult.data ?? [])} />
        </aside>
      </div>
    </AppShell>
  );
}
