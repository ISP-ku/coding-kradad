import { proxyApiRequest } from "@/lib/api-proxy";

export async function POST(request: Request, context: { params: { courseId: string } }) {
  return proxyApiRequest(
    `/api/access/courses/${encodeURIComponent(context.params.courseId)}/members`, "POST", await request.text());
}
