import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import TopicForm from "@/components/TopicForm";
import { logoutUrl } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "New topic · Course Support" };

export default async function NewTopicPage() {
  const viewer = await getSessionUser();
  // Creating a topic needs an account (the API answers 401 otherwise).
  if (!viewer && !PREVIEW) redirect("/");

  return (
    <AppShell
      page="faq"
      title="New topic"
      heading="Ask a question"
      subtitle="A lecturer checks each new topic before everyone can see it."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={ui.formPage}>
        <a className={ui.backLink} href="/faq">← Back to the FAQ</a>
        <TopicForm preview={PREVIEW} />
      </div>
    </AppShell>
  );
}
