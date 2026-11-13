import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AccessManager from "@/components/AccessManager";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ui from "@/components/ui.module.css";
import { logoutUrl } from "@/lib/api";
import { getAccess } from "@/lib/access-server";
import { canAccess, homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Access · Course Support" };

type Search = { course?: string; created?: string; added?: string };

export default async function AccessPage({ searchParams }: { searchParams?: Search }) {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");
  // Lecturer-only (SRS-23); the backend also returns 403 to anyone else.
  if (!canAccess(viewer, "access")) redirect(homePathFor(viewer));
  const data = await getAccess();

  const courseId = Number(searchParams?.course) || undefined;
  const course = data?.courses.find((c) => c.id === courseId);
  const notice = searchParams?.created === "1" && course
    ? `Course ${course.code} created. Use Add people to add its lecturers, TAs and students.`
    : searchParams?.added
      ? `${searchParams.added} now has access${course ? ` to ${course.code}` : ""}.`
      : "";
  const addHref = course ? `/access/members/new?course=${course.id}` : "/access/members/new";

  return (
    <AppShell
      page="access"
      title="Access"
      heading="Course access"
      subtitle="Choose who can sign in to each course and what role they have."
      viewer={viewer}
      logoutHref={logoutUrl}
      actions={
        <>
          <a className={ui.secondaryButton} href="/access/courses/new"><Icon name="plus" /> New course</a>
          {data && data.courses.length > 0 && (
            <a className={ui.actionButton} href={addHref}><Icon name="user" /> Add people</a>
          )}
        </>
      }
    >
      {data ? (
        <AccessManager initial={data} initialCourseId={courseId} initialNotice={notice} />
      ) : (
        <p role="alert">Course access could not be loaded right now. Please try again in a moment.</p>
      )}
    </AppShell>
  );
}
