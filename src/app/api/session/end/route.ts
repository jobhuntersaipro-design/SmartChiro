import { NextRequest } from "next/server";
import { signOut } from "@/lib/auth";

/**
 * GET /api/session/end?reason=account_disabled — clears a session whose account
 * was disabled or deleted after sign-in, then shows the login page. Without
 * this the login page and the dashboard redirect to each other: the edge
 * middleware still sees the cookie, the server no longer accepts it.
 */
export async function GET(request: NextRequest) {
  const disabled = request.nextUrl.searchParams.get("reason") === "account_disabled";
  await signOut({ redirectTo: disabled ? "/login?error=account_disabled" : "/login" });
}
