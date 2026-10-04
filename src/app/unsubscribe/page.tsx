import type { Metadata } from "next";
import { MailX } from "lucide-react";
import { verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe · SmartChiro" };

/**
 * Landing page for the unsubscribe link in recall / review emails. It asks
 * before unsubscribing (a POST), so link checkers that open every link in an
 * email don't unsubscribe the patient by themselves.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; t?: string; done?: string }>;
}) {
  const { p, t, done } = await searchParams;
  const valid = !!p && verifyUnsubscribeToken(p, t);
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md rounded-panel border border-border bg-white px-6 py-10 text-center shadow-(--shadow-card)">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-subtle">
          <MailX className="h-6 w-6 text-brand" strokeWidth={1.5} />
        </div>
        {done ? (
          <>
            <h1 className="text-[23px] font-medium text-foreground">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-[15px] text-fg-secondary">
              The clinic won&apos;t send you check-up reminders or review requests any more. Appointment reminders still come.
            </p>
          </>
        ) : valid ? (
          <>
            <h1 className="text-[23px] font-medium text-foreground">Stop these messages?</h1>
            <p className="mt-2 text-[15px] text-fg-secondary">
              You&apos;ll no longer get check-up reminders or review requests from the clinic. Appointment reminders still come.
            </p>
            <form method="post" action={`/api/public/unsubscribe?p=${encodeURIComponent(p)}&t=${encodeURIComponent(t ?? "")}`}>
              <button
                type="submit"
                className="mt-6 inline-flex h-9 items-center rounded-control bg-primary px-4 text-[14px] font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Unsubscribe
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-[23px] font-medium text-foreground">This link doesn&apos;t work</h1>
            <p className="mt-2 text-[15px] text-fg-secondary">
              Please call the clinic and ask them to stop the messages.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
