import { proxyActivityRequest } from "@/lib/activity-proxy";

export function DELETE(_request: Request, context: { params: { courseId: string; email: string } }) {
  const { courseId, email } = context.params;
  return proxyActivityRequest(
    `/api/access/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(decodeURIComponent(email))}`, "DELETE");
}
