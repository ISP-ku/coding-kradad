import { proxyActivityRequest } from "@/lib/activity-proxy";

export async function POST(request: Request, context: { params: { courseId: string } }) {
  return proxyActivityRequest(
    `/api/access/courses/${encodeURIComponent(context.params.courseId)}/members`, "POST", await request.text());
}
