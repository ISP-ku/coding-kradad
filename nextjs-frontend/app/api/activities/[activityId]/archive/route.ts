import { proxyActivityRequest } from "@/lib/activity-proxy";

export function POST(_request: Request, context: { params: { activityId: string } }) {
  return proxyActivityRequest(`/api/activities/${encodeURIComponent(context.params.activityId)}/archive`, "POST");
}
