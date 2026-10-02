"use client";

import { useEffect, useRef } from "react";
import { CalendarPlus, CheckCircle2, MessageCircle } from "lucide-react";
import type { PublicBookingConfirmation } from "@/types/booking";

interface Props {
  booking: PublicBookingConfirmation;
  timeZoneLabel: string;
  onBookAnother: () => void;
}

/** Confirmation with the booking details, .ics download and a WhatsApp link to the clinic. */
export function BookingSuccess({ booking, timeZoneLabel, onBookAnother }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const message = `Hi ${booking.branch.name}, I just booked ${booking.treatment} on ${booking.dateLabel} at ${booking.timeLabel} online.`;
  const whatsapp = booking.whatsappUrl ? `${booking.whatsappUrl}?text=${encodeURIComponent(message)}` : null;
  const rows: [string, string][] = [
    ["Date", booking.dateLabel],
    ["Time", `${booking.timeLabel} · ${timeZoneLabel}`],
    ["Treatment", `${booking.treatment} (${booking.duration} min)`],
    ["Doctor", booking.doctorName],
    ["Clinic", [booking.branch.name, booking.branch.address].filter(Boolean).join(", ")],
  ];

  return (
    <section className="rounded-surface border border-border bg-white p-5 shadow-(--shadow-card)">
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="h-12 w-12 text-success" strokeWidth={1.5} aria-hidden="true" />
        <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-[23px] font-semibold text-foreground outline-none">
          You&apos;re booked, {booking.firstName}
        </h2>
        <p className="mt-1 text-[15px] text-fg-secondary">The clinic has your booking. You&apos;ll get a reminder before your visit.</p>
      </div>

      <dl className="mt-5 divide-y divide-border rounded-panel border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 px-3 py-2.5 text-[15px]">
            <dt className="w-24 shrink-0 text-fg-muted">{label}</dt>
            <dd className="min-w-0 font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 space-y-2">
        <a
          href={booking.icsUrl}
          download
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-primary text-[16px] font-medium text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Add to calendar
        </a>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-control border border-border bg-white text-[16px] font-medium text-foreground hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <MessageCircle className="h-4 w-4 text-success" aria-hidden="true" />
            WhatsApp the clinic
          </a>
        )}
        <button
          type="button"
          onClick={onBookAnother}
          className="h-10 w-full rounded-control text-[15px] font-medium text-brand hover:bg-brand-subtle focus-visible:outline-2 focus-visible:outline-brand"
        >
          Book another appointment
        </button>
      </div>
    </section>
  );
}
