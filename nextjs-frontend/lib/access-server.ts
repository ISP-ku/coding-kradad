import { backendJson } from "./backend";
import type { AccessData } from "./access";
import { PREVIEW } from "./preview";

/** Courses, members and roles for the lecturer Access pages (SRS-23); null when they could not be loaded. */
export async function getAccess(): Promise<AccessData | null> {
  if (PREVIEW) return { courses: [], accounts: [] };
  return backendJson<AccessData>("/api/access");
}
