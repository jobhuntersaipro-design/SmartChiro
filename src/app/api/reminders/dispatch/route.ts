import { NextResponse } from "next/server";
import { materializePending, dispatchDue } from "@/lib/reminders/dispatcher";
import { expireOverduePackages } from "@/lib/package-service";
import { dispatchOutreach, materializeOutreach } from "@/lib/outreach/dispatcher";

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
  // Packages past their expiry become EXPIRED (fail-soft — never blocks reminders).
  const expiredPackages = await expireOverduePackages(now).catch((e: unknown) => {
    console.error("package expiry sweep failed", e);
    return 0;
  });
  // Recall + review requests run after reminders and never block them.
  const outreach = await runOutreach(now);
  return NextResponse.json({ ok: true, inserted, processed, expiredPackages, outreach });
}

async function runOutreach(now: Date) {
  try {
    const created = await materializeOutreach(now);
    const { processed } = await dispatchOutreach(now);
    return { ...created, processed };
  } catch (e) {
    console.error("outreach dispatch failed", e);
    return { error: "outreach_failed" };
  }
}

// Vercel Cron invokes this path with GET.
export const POST = handler;
export const GET = handler;
