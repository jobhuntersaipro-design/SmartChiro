import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";

/** POST /api/billing/portal → { url }: Stripe's billing portal (change plan, card, invoices, cancel). */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stripe = stripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Online payment isn't set up yet. Please contact SmartChiro." }, { status: 503 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet. Subscribe first." }, { status: 404 });
  }

  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/dashboard/billing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("[billing] portal failed:", err);
    return NextResponse.json({ error: "Couldn't open billing. Please try again." }, { status: 502 });
  }
}
