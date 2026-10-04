import type { Metadata } from "next";
import { CalendarX } from "lucide-react";

export const metadata: Metadata = { title: "Online booking unavailable · SmartChiro" };

/** Patients reach this from a clinic's booking link: no dashboard links here. */
export default function BookingNotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md rounded-panel border border-border bg-white px-6 py-10 text-center shadow-(--shadow-card)">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-subtle">
          <CalendarX className="h-6 w-6 text-brand" strokeWidth={1.5} />
        </div>
        <h1 className="text-[23px] font-medium tracking-[-0.23px] text-foreground">Online booking isn&apos;t available</h1>
        <p className="mt-2 text-[15px] text-fg-secondary">
          This clinic isn&apos;t taking online bookings right now, or the link has changed. Please call the clinic to book.
        </p>
      </div>
    </main>
  );
}
