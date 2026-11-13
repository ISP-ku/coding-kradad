import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessMemberForm } from "@/components/AccessForms";
import AppShell from "@/components/AppShell";
import ui from "@/components/ui.module.css";
import { authOptions, logoutUrl } from "@/lib/api";
import { getAccess } from "@/lib/access-server";
import { canAccess, homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add people · Course Support" };

export default async function AddPeoplePage({ searchParams }: { searchParams?: { course?: string } }) {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");
  if (!canAccess(viewer, "access")) redirect(homePathFor(viewer));
  const [data, options] = await Promise.all([getAccess(), authOptions()]);
  // Nobody can be added before a course exists.
  if (data && data.courses.length === 0) redirect("/access/courses/new");

  return (
    <AppShell
      page="access"
      title="Add people"
      heading="Add people to a course"
      subtitle="Only people in a course can sign in. Use their KU email."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={ui.formPage}>
        <a className={ui.backLink} href={searchParams?.course ? `/access?course=${searchParams.course}` : "/access"}>← Back to course access</a>
        {data ? (
          <AccessMemberForm courses={data.courses} defaultCourseId={Number(searchParams?.course) || undefined} allowPersonal={options.personal_google} />
        ) : (
          <p role="alert">Courses could not be loaded right now. Please try again in a moment.</p>
        )}
      </div>
    </AppShell>
  );
}
