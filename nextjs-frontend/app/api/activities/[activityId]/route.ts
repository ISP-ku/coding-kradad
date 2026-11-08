import { proxyActivityRequest } from "@/lib/activity-proxy";

export function GET(_request: Request, context: { params: { activityId: string } }) {
  return proxyActivityRequest(`/api/activities/${encodeURIComponent(context.params.activityId)}`, "GET");
}

export async function PATCH(request: Request, context: { params: { activityId: string } }) {
  return proxyActivityRequest(`/api/activities/${encodeURIComponent(context.params.activityId)}`, "PATCH", await request.text());
}

export function DELETE(_request: Request, context: { params: { activityId: string } }) {
  return proxyActivityRequest(`/api/activities/${encodeURIComponent(context.params.activityId)}`, "DELETE");
}
