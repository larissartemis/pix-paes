import { NextRequest, NextResponse } from "next/server";

/**
 * Fallback route for Web Share Target if a request reaches the server
 * before the Service Worker takes control.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const text = formData.get("text")?.toString() || "";
    const url = formData.get("url")?.toString() || "";
    const title = formData.get("title")?.toString() || "";

    const params = new URLSearchParams();
    if (url) params.set("url", url);
    if (text) params.set("text", text);
    if (title) params.set("title", title);

    const redirectUrl = new URL(`/?${params.toString()}`, request.url);
    return NextResponse.redirect(redirectUrl, 303);
  } catch {
    return NextResponse.redirect(new URL("/?shared_error=1", request.url), 303);
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url), 302);
}
