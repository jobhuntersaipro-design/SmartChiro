import { NextResponse } from "next/server";
import { unsubscribePatient } from "@/lib/outreach/unsubscribe";

/**
 * POST /api/public/unsubscribe?p=&t= — the email's unsubscribe button and
 * mail apps' one-click unsubscribe (RFC 8058) both land here.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const ok = await unsubscribePatient(url.searchParams.get("p") ?? "", url.searchParams.get("t"));
  if (!ok) return NextResponse.json({ error: "invalid_link" }, { status: 400 });
  // A form post from the page goes back to it; a mail app only needs the 200.
  if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded") && !url.searchParams.has("oneclick")) {
    return NextResponse.redirect(new URL("/unsubscribe?done=1", url), 303);
  }
  return NextResponse.json({ ok: true });
}
