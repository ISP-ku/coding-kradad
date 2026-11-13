import { proxyActivityRequest } from "@/lib/activity-proxy";

export async function PATCH(request: Request, context: { params: { email: string } }) {
  return proxyActivityRequest(
    `/api/access/accounts/${encodeURIComponent(decodeURIComponent(context.params.email))}`, "PATCH", await request.text());
}
