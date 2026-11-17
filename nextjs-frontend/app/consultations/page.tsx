import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import ui from "@/components/ui.module.css";
import ConsultationHistory, { formatDuration } from "@/components/ConsultationHistory";
import Icon from "@/components/Icon";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW, previewConsultations } from "@/lib/preview";
import { canAccess } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import type { Consultation } from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Consultation Log · Course Support" };

// Asks the backend for this TA's own history, forwarding the session cookie.
// `signedIn` is false when the backend answers 401 (nobody is logged in).
async function getConsultations(): Promise<{ entries: Consultation[]; signedIn: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/consultations`, {
      headers: { cookie: cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ") },
      cache: "no-store",
    });
    if (res.status === 401) return { entries: [], signedIn: false };
    if (!res.ok) return { entries: [], signedIn: true };
    return { entries: (await res.json()) as Consultation[], signedIn: true };
  } catch {
    return { entries: [], signedIn: true };
  }
}

export default async function ConsultationsPage({ searchParams }: { searchParams?: { saved?: string } }) {
  const viewer = await getSessionUser();
  // SRS-14: only TAs keep consultation logs. The API answers 403 for everyone
  // else, so don't even ask it.
  const forbidden = !PREVIEW && viewer !== null && !canAccess(viewer, "consultations");
  const { entries, signedIn } = PREVIEW
    ? { entries: viewer ? previewConsultations : [], signedIn: viewer !== null }
    : forbidden
      ? { entries: [], signedIn: true }
      : await getConsultations();
  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

  return (
    <AppShell
      page="consultations"
      title="Consultation Log"
      heading="Consultation log"
      subtitle="Keep track of the support you give students."
      viewer={viewer}
      logoutHref={logoutUrl}
      actions={signedIn && !forbidden ? (
        <a className={ui.actionButton} href="/consultations/new"><Icon name="plus" /> Record consultation</a>
      ) : undefined}
    >
      {forbidden ? (
        <p role="alert">The consultation log is only available to teaching assistants.</p>
      ) : signedIn ? (
        <>
          <div className={styles.actionsRow}>
            <div>
              <h2>Consultation history</h2>
              {entries.length > 0 && (
                <p className={styles.summary}>
                  {entries.length} {entries.length === 1 ? "session" : "sessions"}, {formatDuration(totalMinutes)} in total
                </p>
              )}
            </div>
          </div>
          {searchParams?.saved === "1" && (
            <div className={styles.notice} role="status">Consultation saved.</div>
          )}
          <ConsultationHistory entries={entries} />
        </>
      ) : (
        <p>
          Please <Link href="/">sign in</Link> to record and view your consultations.
        </p>
      )}
    </AppShell>
  );
}
