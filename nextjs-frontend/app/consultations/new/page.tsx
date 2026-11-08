import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ConsultationForm from "@/components/ConsultationForm";
import { logoutUrl } from "@/lib/api";
import { canAccess, homePathFor } from "@/lib/permissions";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Record consultation · Course Support" };

export default async function NewConsultationPage() {
  const viewer = await getSessionUser();
  // Not signed in: the history page shows the sign-in message.
  if (!viewer) redirect("/consultations");
  // SRS-14: only TAs record consultations; the API refuses everyone else (403).
  if (!PREVIEW && !canAccess(viewer, "consultations")) redirect(homePathFor(viewer));

  return (
    <AppShell
      page="consultations"
      title="Record consultation"
      heading="Record a consultation"
      subtitle="Log a session you ran with students."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={styles.page}>
        <a className={styles.backLink} href="/consultations">← Back to consultation history</a>
        <ConsultationForm preview={PREVIEW} />
      </div>
    </AppShell>
  );
}
