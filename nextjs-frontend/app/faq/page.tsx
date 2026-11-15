import type { Metadata } from "next";
import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ui from "@/components/ui.module.css";
import TopicBoard from "@/components/TopicBoard";
import { API_BASE, logoutUrl } from "@/lib/api";
import { getPendingTopics } from "@/lib/faq";
import { PREVIEW, previewTopics } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { Topic } from "@/lib/types";

export const metadata: Metadata = { title: "FAQ / Issue Log · Course Support" };

// The search endpoint works without a session (students can browse without
// full account access), but forwarding the cookie when one exists lets the
// initial render show this viewer's own "saved" stars correctly too.
async function getTopics(query: string): Promise<Topic[]> {
  if (PREVIEW) {
    const q = query.trim().toLowerCase();
    if (!q) return previewTopics.filter((t) => t.status === "Published");
    return previewTopics.filter(
      (t) =>
        t.status === "Published" &&
        (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
  }

  try {
    const url = new URL(`${API_BASE}/api/faq`);
    if (query) url.searchParams.set("q", query);
    const res = await fetch(url, {
      headers: { cookie: cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ") },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as Topic[];
  } catch {
    return [];
  }
}

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
