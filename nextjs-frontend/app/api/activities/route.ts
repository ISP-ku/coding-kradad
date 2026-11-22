import { proxyApiRequest } from "@/lib/api-proxy";

export function GET() {
  return proxyApiRequest("/api/activities", "GET");
}

export async function POST(request: Request) {
  return proxyApiRequest("/api/activities", "POST", await request.text());
}
