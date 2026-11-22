/** Consultation log calls for client components (TA only, SRS-14). Never throws. */
import { request, type Outcome } from "./request";
import type { Consultation } from "./types";

export type NewConsultation = Pick<Consultation, "session_date" | "duration_minutes" | "topic" | "participants">;

export function recordConsultation(session: NewConsultation): Promise<Outcome<Consultation>> {
  return request("/api/consultations", {
    method: "POST", body: session, fallback: "Could not save right now. Please try again.",
  });
}
