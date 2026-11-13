import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ui from "@/components/ui.module.css";
import HomeworkStaff from "@/components/HomeworkStaff";
import HomeworkStudent from "@/components/HomeworkStudent";
import { API_BASE, logoutUrl } from "@/lib/api";
import { effectiveRole } from "@/lib/permissions";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { HomeworkItem } from "@/lib/types";

export const metadata: Metadata = { title: "Homework · Course Support" };

async function getHomework(): Promise<{ items: HomeworkItem[]; failed: boolean }> {
  if (PREVIEW) return { items: [], failed: false };
  try {
    const res = await fetch(`${API_BASE}/api/homework`, {
      headers: { cookie: cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ") },
      cache: "no-store",
    });
    if (!res.ok) return { items: [], failed: true };
    return { items: (await res.json()) as HomeworkItem[], failed: false };
  } catch {
    return { items: [], failed: true };
  }
}

const COPY = {
  student: {
    heading: "Homework",
    subtitle: "Everything your courses have assigned, by due date, on a calendar or by course.",
  },
  ta: {
    heading: "Homework to grade",
    subtitle: "Review what students handed in and give each submission a score.",
  },
  lecturer: {
    heading: "Assign and track homework",
    subtitle: "Assign homework to the course and see how many students have handed it in.",
  },
} as const;

export default async function HomeworkPage({ searchParams }: { searchParams?: { assigned?: string } }) {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");
  const role = effectiveRole(viewer);
  const { items, failed } = await getHomework();

  return (
    <AppShell
      page="homework"
      title="Homework"
      heading={COPY[role].heading}
      subtitle={COPY[role].subtitle}
      viewer={viewer}
      logoutHref={logoutUrl}
      actions={role === "lecturer" ? (
        <a className={ui.actionButton} href="/homework/new"><Icon name="plus" /> Assign homework</a>
      ) : undefined}
    >
      {searchParams?.assigned === "1" && <p className={ui.notice} role="status">Homework assigned. Students can see it now.</p>}
      {failed && <p role="alert">Homework could not be loaded right now. Please try again in a moment.</p>}
      {!failed && role === "student" && <HomeworkStudent initial={items} />}
      {!failed && role !== "student" && <HomeworkStaff initial={items} role={role} />}
    </AppShell>
  );
}
