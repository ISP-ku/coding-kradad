import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import TopicThread from "@/components/TopicThread";
import { logoutUrl } from "@/lib/api";
import { getTopicDetail } from "@/lib/faq";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";

type Props = { params: { topicId: string } };

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
