import { proxyActivityRequest } from "@/lib/activity-proxy";

export function GET() {
  return proxyActivityRequest("/api/activities/assignees", "GET");
}
