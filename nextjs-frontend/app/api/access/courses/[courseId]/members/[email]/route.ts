import { proxyApiRequest } from "@/lib/api-proxy";

export function DELETE(_request: Request, context: { params: { courseId: string; email: string } }) {
  const { courseId, email } = context.params;
  return proxyApiRequest(
    `/api/access/courses/${encodeURIComponent(courseId)}/members/${encodeURIComponent(decodeURIComponent(email))}`, "DELETE");
}
