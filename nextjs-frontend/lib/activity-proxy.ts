import { cookies } from "next/headers";
import { API_BASE } from "./api";

export async function proxyActivityRequest(path: string, method: string, body?: string) {
  const cookieHeader = cookies().getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  try {
    const upstream = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        cookie: cookieHeader,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "Activity service is unavailable. Start the backend and try again." }, { status: 502 });
  }
}
