import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_COOKIE } from "@/lib/preview";

export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete(PREVIEW_COOKIE);
  return res;
}
