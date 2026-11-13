import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessCourseForm } from "@/components/AccessForms";
import AppShell from "@/components/AppShell";
import ui from "@/components/ui.module.css";
import { logoutUrl } from "@/lib/api";
import { canAccess, homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "New course · Course Support" };

export default async function NewCoursePage() {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");
  if (!canAccess(viewer, "access")) redirect(homePathFor(viewer));

  return (
    <AppShell
      page="access"
      title="New course"
      heading="New course"
      subtitle="Create the course first, then add the people who take or teach it."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={ui.formPage}>
        <a className={ui.backLink} href="/access">← Back to course access</a>
        <AccessCourseForm />
      </div>
    </AppShell>
  );
}
