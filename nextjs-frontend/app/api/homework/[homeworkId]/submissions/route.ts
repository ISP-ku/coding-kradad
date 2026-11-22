import { proxyApiRequest } from "@/lib/api-proxy";

type Context = { params: { homeworkId: string } };
const base = (c: Context) => `/api/homework/${encodeURIComponent(c.params.homeworkId)}/submissions`;

export function GET(_request: Request, context: Context) {
  return proxyApiRequest(base(context), "GET");
}

export async function POST(request: Request, context: Context) {
  return proxyApiRequest(base(context), "POST", await request.text());
}
