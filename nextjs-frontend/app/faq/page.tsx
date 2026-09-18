import Link from "next/link";
import type { FaqEntry, FaqStatus } from "@/lib/types";
import styles from "./page.module.css";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

const statusClass: Record<FaqStatus, string> = {
  published: styles.statusPublished,
  pending: styles.statusPending,
  rejected: styles.statusRejected,
};

async function getFaqEntries(query: string): Promise<FaqEntry[]> {
  const url = new URL(`${API_BASE}/api/faq`);
  if (query) url.searchParams.set("q", query);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as FaqEntry[];
}

export default async function FaqPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = searchParams.q ?? "";
  const entries = await getFaqEntries(query);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/">&larr; Back</Link>
        <strong>FAQ / Issue Log</strong>
      </div>

      <form className={styles.searchBox} method="get">
        <input
          type="text"
          name="q"
          placeholder="Search question, answer, or tag..."
          defaultValue={query}
        />
        <button type="submit">Search</button>
      </form>

      {entries.length > 0 ? (
        entries.map((entry, i) => (
          <div className={styles.faqCard} key={i}>
            <div className={styles.faqQuestion}>{entry.question}</div>
            <div className={styles.faqAnswer}>{entry.answer}</div>
            <div className={styles.faqMeta}>
              <span className={`${styles.status} ${statusClass[entry.status]}`}>
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
          New entries are saved as <strong>Pending</strong> and only become
          visible to others after lecturer approval (SRS-17).
        </p>
        <form method="post" action={`${API_BASE}/faq/submit`}>
          <label>Question</label>
          <input
            type="text"
            name="question"
            placeholder="e.g. When is the midterm project due?"
            required
          />

          <label>Answer (optional, TA can propose one)</label>
          <textarea
            name="answer"
            rows={3}
            placeholder="Optional draft answer..."
          />

          <label>Tags (comma separated)</label>
          <input type="text" name="tags" placeholder="e.g. deadline, project" />

          <button type="submit">Submit for Approval</button>
        </form>
      </div>
    </main>
  );
}
