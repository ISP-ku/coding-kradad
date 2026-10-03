import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { API_BASE, logoutUrl } from "@/lib/api";
import { PREVIEW, previewFaq } from "@/lib/preview";
import { getSessionUser } from "@/lib/session";
import type { FaqEntry } from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "FAQ / Issue Log · Course Support" };

const statusClass: Record<string, string> = {
  published: styles.statusPublished,
  pending: styles.statusPending,
  rejected: styles.statusRejected,
};

async function getFaqEntries(query: string): Promise<FaqEntry[]> {
  if (PREVIEW) {
    const q = query.trim().toLowerCase();
    if (!q) return previewFaq;
    return previewFaq.filter(
      (e) =>
        e.question.toLowerCase().includes(q) ||
        e.answer.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  try {
    const url = new URL(`${API_BASE}/api/faq`);
    if (query) url.searchParams.set("q", query);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as FaqEntry[];
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
  const [viewer, entries] = await Promise.all([getSessionUser(), getFaqEntries(query)]);

  return (
    <AppShell
      page="faq"
      title="FAQ / Issue Log"
      heading="Questions, answers & course support"
      subtitle="Find an answer or ask your teaching team."
      viewer={viewer}
      logoutHref={logoutUrl}
    >
      <div className={styles.page}>
        <form className={styles.searchBox} method="get" action="/faq">
          <input
            type="text"
            aria-label="Search FAQs"
            name="q"
            placeholder="Search question, answer, or tag..."
            defaultValue={query}
          />
          <button type="submit" className={styles.btn}>
            Search
          </button>
        </form>

        {entries.length > 0 ? (
          entries.map((entry, i) => (
            <div className={styles.faqCard} key={i}>
              <div className={styles.faqQuestion}>{entry.question}</div>
              <div className={styles.faqAnswer}>{entry.answer}</div>
              <div className={styles.faqMeta}>
                <span
                  className={`${styles.status} ${statusClass[entry.status.toLowerCase()] ?? ""}`}
                >
                  {entry.status}
                </span>
                {entry.tags.map((tag) => (
                  <span className={styles.tag} key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p>No matching FAQ/issue entries found.</p>
        )}

        <div className={styles.submitPanel}>
          <h3>Submit a new question</h3>
          <p className={styles.hint}>
            New entries are saved as <strong>Pending</strong> and only become visible
            to others after lecturer approval.
          </p>
          <form method="post" action={`${API_BASE}/faq/submit`}>
            <label htmlFor="question">Question</label>
            <input
              type="text"
              id="question"
              name="question"
              placeholder="e.g. When is the midterm project due?"
              required
            />

            <label htmlFor="answer">Answer (optional, TA can propose one)</label>
            <textarea
              id="answer"
              name="answer"
              rows={3}
              placeholder="Optional draft answer..."
            />

            <label htmlFor="tags">Tags (comma separated)</label>
            <input type="text" id="tags" name="tags" placeholder="e.g. deadline, project" />

            <button type="submit" className={styles.btn}>
              Submit for Approval
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
