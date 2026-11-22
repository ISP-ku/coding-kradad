import { proxyApiRequest } from "@/lib/api-proxy";

export async function PATCH(request: Request, context: { params: { email: string } }) {
  return proxyApiRequest(
    `/api/access/accounts/${encodeURIComponent(decodeURIComponent(context.params.email))}`, "PATCH", await request.text());
}
