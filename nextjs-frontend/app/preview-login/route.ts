import { NextRequest, NextResponse } from "next/server";
import { PREVIEW, PREVIEW_COOKIE } from "@/lib/preview";

// Only active when UI_PREVIEW=1: fake "login" for previewing the UI.
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL(PREVIEW ? "/dashboard" : "/", req.url));
  if (PREVIEW) {
    const provider = req.nextUrl.searchParams.get("provider") ?? "discord";
    res.cookies.set(PREVIEW_COOKIE, provider, { path: "/" });
  }
  return res;
}
