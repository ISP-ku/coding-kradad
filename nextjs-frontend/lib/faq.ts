import { cookies } from "next/headers";
import { API_BASE } from "./api";
import { PREVIEW, previewPendingFaq } from "./preview";
import type { FaqEntry } from "./types";

/**
 * FAQ/issue entries awaiting lecturer review (SRS-18). Lecturer-only on
 * the backend, so this forwards the session cookie the same way
 * lib/reports.ts does - the public search in app/faq/page.tsx does not,
 * since that one is reachable without signing in.
 */
export async function getPendingFaq(): Promise<FaqEntry[]> {
  if (PREVIEW) return previewPendingFaq;

  const session = cookies().get("ku_session")?.value;
  if (!session) return [];

  try {
    const res = await fetch(`${API_BASE}/api/faq/pending`, {
      headers: { cookie: `ku_session=${session}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as FaqEntry[];
  } catch {
    return [];
  }
}
