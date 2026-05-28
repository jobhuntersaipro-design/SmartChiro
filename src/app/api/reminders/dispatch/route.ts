import { NextResponse } from "next/server";
import { materializePending, dispatchDue } from "@/lib/reminders/dispatcher";

export const dynamic = "force-dynamic";

async function handler(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  const ok =
    expected && (headerSecret === expected || auth === `Bearer ${expected}`);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  const now = new Date();
  const inserted = await materializePending(now);
  const { processed } = await dispatchDue(now);
  return NextResponse.json({ ok: true, inserted, processed });
}

// Both methods are exported because Vercel Cron's default trigger is GET;
// `vercel.json` requests POST explicitly, but we keep GET as a safety net so
// a config drift doesn't silently disable the dispatch loop. Both handlers
// gate on CRON_SECRET, so unauthorized prefetch / browser hits 401.
export const POST = handler;
export const GET = handler;
