import { proxyApiRequest } from "@/lib/api-proxy";

export function GET() {
  return proxyApiRequest("/api/access", "GET");
}
