import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import TopicThread from "@/components/TopicThread";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW, previewTopicDetail } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { TopicDetail } from "@/lib/types";

type Props = { params: { topicId: string } };

async function getTopicDetail(id: string): Promise<TopicDetail | null> {
  if (PREVIEW) return previewTopicDetail(Number(id));

  try {
    const res = await fetch(`${API_BASE}/api/faq/${id}`, {
      headers: { cookie: cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ") },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as TopicDetail;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await getTopicDetail(params.topicId);
  return { title: topic ? `${topic.title} · FAQ / Issue Log` : "Topic not found · Course Support" };
}

export default async function TopicDetailPage({ params }: Props) {
  const [viewer, topic] = await Promise.all([getSessionUser(), getTopicDetail(params.topicId)]);
  if (!topic) notFound();

  return (
    <AppShell
      page="faq"
      title="FAQ / Issue Log"
      heading={topic.title}
      subtitle="Discuss this topic with the course team."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <TopicThread topic={topic} viewer={viewer} preview={PREVIEW} />
    </AppShell>
  );
}
