import { backendFetch } from "./backend";

export async function proxyActivityRequest(path: string, method: string, body?: string) {
  try {
    const upstream = await backendFetch(path, {
      method,
      ...(body ? { headers: { "content-type": "application/json" }, body } : {}),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "Activity service is unavailable. Start the backend and try again." }, { status: 502 });
  }
}
