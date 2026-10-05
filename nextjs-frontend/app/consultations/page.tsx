import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import ConsultationLog from "@/components/ConsultationLog";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW, previewConsultations } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { Consultation } from "@/lib/types";

export const metadata: Metadata = { title: "Consultation Log · Course Support" };

// Asks the backend for this TA's own history, forwarding the session cookie.
// `signedIn` is false when the backend answers 401 (nobody is logged in).
async function getConsultations(): Promise<{ entries: Consultation[]; signedIn: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/consultations`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });
    if (res.status === 401) return { entries: [], signedIn: false };
    if (!res.ok) return { entries: [], signedIn: true };
    return { entries: (await res.json()) as Consultation[], signedIn: true };
  } catch {
    return { entries: [], signedIn: true };
  }
}

export default async function ConsultationsPage() {
  const viewer = await getSessionUser();
  const { entries, signedIn } = PREVIEW
    ? { entries: viewer ? previewConsultations : [], signedIn: viewer !== null }
    : await getConsultations();

  return (
    <AppShell
      page="consultations"
      title="Consultation Log"
      heading="Record and review your consultations"
      subtitle="Keep track of the support you give students."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      {signedIn ? (
        <ConsultationLog initial={entries} preview={PREVIEW} />
      ) : (
        <p>
          Please <Link href="/">sign in</Link> to record and view your consultations.
        </p>
      )}
    </AppShell>
  );
}
