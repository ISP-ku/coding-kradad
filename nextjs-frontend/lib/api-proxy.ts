import { backendFetch } from "./backend";

/**
 * Passes one browser request from a Next.js /api route to the FastAPI
 * backend with the browser's cookies, and hands the backend's reply back
 * unchanged. Used by the activities, homework and Access routes.
 */
export async function proxyApiRequest(path: string, method: string, body?: string) {
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
    return Response.json({ detail: "The backend is unavailable. Start it and try again." }, { status: 502 });
  }
}
