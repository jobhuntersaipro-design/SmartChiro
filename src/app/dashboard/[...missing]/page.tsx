import { notFound } from "next/navigation";

/**
 * Unknown dashboard URLs (e.g. /dashboard/reports, /dashboard/billing until
 * they're built) render the dashboard 404 inside the shell instead of the
 * bare root one. Real routes always win over this catch-all.
 */
export default function MissingDashboardPage() {
  notFound();
}
