import { proxyActivityRequest } from "@/lib/activity-proxy";

type Context = { params: { homeworkId: string } };
const base = (c: Context) => `/api/homework/${encodeURIComponent(c.params.homeworkId)}/submissions`;

export function GET(_request: Request, context: Context) {
  return proxyActivityRequest(base(context), "GET");
}

export async function POST(request: Request, context: Context) {
  return proxyActivityRequest(base(context), "POST", await request.text());
}
