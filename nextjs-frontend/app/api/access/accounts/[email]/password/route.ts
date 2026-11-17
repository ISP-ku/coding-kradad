import { proxyActivityRequest } from "@/lib/activity-proxy";

const path = (email: string) => `/api/access/accounts/${encodeURIComponent(decodeURIComponent(email))}/password`;

export async function POST(_request: Request, context: { params: { email: string } }) {
  return proxyActivityRequest(path(context.params.email), "POST");
}

export async function DELETE(_request: Request, context: { params: { email: string } }) {
  return proxyActivityRequest(path(context.params.email), "DELETE");
}
