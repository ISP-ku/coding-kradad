import { proxyActivityRequest } from "@/lib/activity-proxy";

export async function POST(request: Request) {
  return proxyActivityRequest("/api/access/courses", "POST", await request.text());
}
