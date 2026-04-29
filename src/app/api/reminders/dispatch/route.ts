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

export const POST = handler;
export const GET = handler;
