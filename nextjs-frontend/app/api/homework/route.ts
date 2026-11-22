import { proxyApiRequest } from "@/lib/api-proxy";

export function GET() {
  return proxyApiRequest("/api/homework", "GET");
}

export async function POST(request: Request) {
  return proxyApiRequest("/api/homework", "POST", await request.text());
}
