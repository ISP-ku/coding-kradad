import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import HomeworkAssignForm from "@/components/HomeworkAssignForm";
import { logoutUrl } from "@/lib/api";
import { effectiveRole } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Assign homework · Course Support" };

export default async function AssignHomeworkPage() {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");
  // Only lecturers assign homework; the API refuses everyone else (403).
  if (effectiveRole(viewer) !== "lecturer") redirect("/homework");

  return (
    <AppShell
      page="homework"
      title="Assign homework"
      heading="Assign homework"
      subtitle="Everyone in the course sees it as soon as you assign it."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={ui.formPage}>
        <a className={ui.backLink} href="/homework">← Back to homework</a>
        <HomeworkAssignForm />
      </div>
    </AppShell>
  );
}
