import { NextResponse } from "next/server";
import { accountAccess } from "@/lib/subscription";

/**
 * Lapsed accounts (trial over, no plan, not covered by their clinic) are
 * read-only: every create / edit / delete answers 402 until they subscribe.
 * Reading and exporting their data keeps working. Null when allowed.
 */
export async function paywall(userId: string): Promise<NextResponse | null> {
  const access = await accountAccess(userId);
  if (!access || access.allowed) return null;
  return NextResponse.json(
    {
      error: "subscription_required",
      message: "Your free trial has ended. Your data is safe and you can still view it; subscribe to make changes.",
    },
    { status: 402 },
  );
}

/** `paywall` for the signed-in user (routes whose own guard hides the user). */
export async function paywallCurrentUser(): Promise<NextResponse | null> {
  // Loaded on use: routes that only need `paywall` shouldn't pull in NextAuth.
  const { getCurrentUser } = await import("@/lib/auth-utils");
  const user = await getCurrentUser();
  return user?.id ? paywall(user.id) : null;
}
