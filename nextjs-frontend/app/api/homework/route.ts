import { proxyActivityRequest } from "@/lib/activity-proxy";

export function GET() {
  return proxyActivityRequest("/api/homework", "GET");
}

export async function POST(request: Request) {
  return proxyActivityRequest("/api/homework", "POST", await request.text());
}
