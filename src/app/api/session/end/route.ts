import { NextRequest } from "next/server";
import { signOut } from "@/lib/auth";

/**
 * GET /api/session/end?reason=account_disabled|password_changed — clears a
 * session whose account was disabled or deleted, or whose password was changed,
 * after sign-in, then shows the login page. Without
 * this the login page and the dashboard redirect to each other: the edge
 * middleware still sees the cookie, the server no longer accepts it.
 */
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const redirectTo =
    reason === "account_disabled" ? "/login?error=account_disabled" : reason === "password_changed" ? "/login?reset=success" : "/login";
  await signOut({ redirectTo });
}
