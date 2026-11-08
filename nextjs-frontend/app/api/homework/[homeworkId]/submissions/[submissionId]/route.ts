import { proxyActivityRequest } from "@/lib/activity-proxy";

export async function PATCH(
  request: Request,
  context: { params: { homeworkId: string; submissionId: string } },
) {
  const { homeworkId, submissionId } = context.params;
  return proxyActivityRequest(
    `/api/homework/${encodeURIComponent(homeworkId)}/submissions/${encodeURIComponent(submissionId)}`,
    "PATCH",
    await request.text(),
  );
}
