import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /preview-logout", () => {
  it("redirects to / and clears the preview cookie", () => {
    const req = new NextRequest("http://localhost:3000/preview-logout", {
      headers: { cookie: "preview_user=discord" },
    });
    const res = GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    // next/server marks a deleted cookie with an empty value / past expiry,
    // rather than removing the Set-Cookie header outright.
    expect(res.cookies.get("preview_user")?.value).toBe("");
  });
});
