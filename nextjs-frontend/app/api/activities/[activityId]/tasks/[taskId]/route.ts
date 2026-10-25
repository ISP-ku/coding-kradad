import { proxyActivityRequest } from "@/lib/activity-proxy";

export async function PATCH(request: Request, context: { params: { activityId: string; taskId: string } }) {
  const { activityId, taskId } = context.params;
  return proxyActivityRequest(`/api/activities/${encodeURIComponent(activityId)}/tasks/${encodeURIComponent(taskId)}`, "PATCH", await request.text());
}
