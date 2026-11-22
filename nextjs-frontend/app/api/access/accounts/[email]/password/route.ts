import { proxyApiRequest } from "@/lib/api-proxy";

const path = (email: string) => `/api/access/accounts/${encodeURIComponent(decodeURIComponent(email))}/password`;

export async function POST(_request: Request, context: { params: { email: string } }) {
  return proxyApiRequest(path(context.params.email), "POST");
}

export async function DELETE(_request: Request, context: { params: { email: string } }) {
  return proxyApiRequest(path(context.params.email), "DELETE");
}
