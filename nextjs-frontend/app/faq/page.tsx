import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ui from "@/components/ui.module.css";
import TopicBoard from "@/components/TopicBoard";
import { logoutUrl } from "@/lib/api";
import { getPendingTopics, getTopics } from "@/lib/faq";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "FAQ / Issue Log · Course Support" };

export default async function FaqPage({
  searchParams,
}: {
  searchParams: { q?: string; submitted?: string };
}) {
  const query = searchParams.q ?? "";
  const [viewer, topics] = await Promise.all([getSessionUser(), getTopics(query)]);
  const pending = viewer?.role === "lecturer" ? await getPendingTopics() : [];

  return (
    <AppShell
      page="faq"
      title="FAQ / Issue Log"
      heading="FAQ"
      subtitle="Search what others have asked, or ask something new."
      viewer={viewer}
      logoutHref={logoutUrl}
      actions={viewer || PREVIEW ? (
        <a className={ui.actionButton} href="/faq/new"><Icon name="plus" /> New topic</a>
      ) : (
        <a className={ui.secondaryButton} href="/">Sign in to ask a question</a>
      )}
    >
      {searchParams.submitted === "1" && (
        <p className={ui.notice} role="status">Your topic was sent. It appears on the board once a lecturer approves it.</p>
      )}
      <TopicBoard initialTopics={topics} initialPending={pending} viewer={viewer} preview={PREVIEW} query={query} />
    </AppShell>
  );
}
