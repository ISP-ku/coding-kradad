import type { Metadata } from "next";
import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
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
  searchParams: { q?: string };
}) {
  const query = searchParams.q ?? "";
  const [viewer, topics] = await Promise.all([getSessionUser(), getTopics(query)]);
  const pending = viewer?.role === "lecturer" ? await getPendingTopics() : [];

  return (
    <AppShell
      page="faq"
      title="FAQ / Issue Log"
      heading="Questions, answers & course support"
      subtitle="Browse a topic or start a new one - click in to discuss."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <TopicBoard initialTopics={topics} initialPending={pending} viewer={viewer} preview={PREVIEW} query={query} />
    </AppShell>
  );
}
