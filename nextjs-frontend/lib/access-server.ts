import { cookies } from "next/headers";
import { API_BASE } from "./api";
import type { AccessData } from "./access";
import { PREVIEW } from "./preview";

/** Courses, members and roles for the lecturer Access pages (SRS-23); null when they could not be loaded. */
export async function getAccess(): Promise<AccessData | null> {
  if (PREVIEW) return { courses: [], accounts: [] };
  try {
    const res = await fetch(`${API_BASE}/api/access`, {
      headers: { cookie: cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ") },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as AccessData) : null;
  } catch {
    return null;
  }
}
