import { proxyApiRequest } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApiRequest("/api/access/courses", "POST", await request.text());
}
