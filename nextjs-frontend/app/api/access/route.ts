import { proxyActivityRequest } from "@/lib/activity-proxy";

export function GET() {
  return proxyActivityRequest("/api/access", "GET");
}
