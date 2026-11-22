import { proxyApiRequest } from "@/lib/api-proxy";

export function POST(_request: Request, context: { params: { activityId: string } }) {
  return proxyApiRequest(`/api/activities/${encodeURIComponent(context.params.activityId)}/archive`, "POST");
}
