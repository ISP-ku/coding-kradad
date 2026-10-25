import { proxyActivityRequest } from "@/lib/activity-proxy";

export function GET() {
  return proxyActivityRequest("/api/activities", "GET");
}

export async function POST(request: Request) {
  return proxyActivityRequest("/api/activities", "POST", await request.text());
}
