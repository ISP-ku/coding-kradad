import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AccessManager from "@/components/AccessManager";
import AppShell from "@/components/AppShell";
import { API_BASE, logoutUrl } from "@/lib/api";
import type { AccessData } from "@/lib/access";
import { canAccess, homePathFor } from "@/lib/permissions";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Access · Course Support" };

async function getAccess(): Promise<AccessData | null> {
  if (PREVIEW) return { courses: [], accounts: [] };
  try {
    const res = await fetch(`${API_BASE}/api/access`, {
      headers: { cookie: cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ") },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as AccessData) : null;
  } catch {
    return null;
  }
}

export default async function AccessPage() {
  const viewer = await getSessionUser();
  if (!viewer) redirect("/");
  // Lecturer-only (SRS-23); the backend also returns 403 to anyone else.
  if (!canAccess(viewer, "access")) redirect(homePathFor(viewer));
  const data = await getAccess();

  return (
    <AppShell
      page="access"
      title="Access"
      heading="Course access"
      subtitle="Choose who can sign in to each course and what role they have."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      {data ? (
        <AccessManager initial={data} />
      ) : (
        <p role="alert">Course access could not be loaded right now. Please try again in a moment.</p>
      )}
    </AppShell>
  );
}
