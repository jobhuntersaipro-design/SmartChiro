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
    <section className="rounded-[8px] border border-[#E3E8EE] bg-white p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="h-12 w-12 text-[#30B130]" strokeWidth={1.5} aria-hidden="true" />
        <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-[23px] font-semibold text-[#0A2540] outline-none">
          You&apos;re booked, {booking.firstName}
        </h2>
        <p className="mt-1 text-[15px] text-[#425466]">The clinic has your booking. You&apos;ll get a reminder before your visit.</p>
      </div>

      <dl className="mt-5 divide-y divide-[#E3E8EE] rounded-[6px] border border-[#E3E8EE]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 px-3 py-2.5 text-[15px]">
            <dt className="w-24 shrink-0 text-[#697386]">{label}</dt>
            <dd className="min-w-0 font-medium text-[#0A2540]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 space-y-2">
        <a
          href={booking.icsUrl}
          download
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#635BFF] text-[16px] font-medium text-white hover:bg-[#5851EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#635BFF]"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Add to calendar
        </a>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[4px] border border-[#E3E8EE] bg-white text-[16px] font-medium text-[#0A2540] hover:bg-[#F0F3F7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#635BFF]"
          >
            <MessageCircle className="h-4 w-4 text-[#1FA855]" aria-hidden="true" />
            WhatsApp the clinic
          </a>
        )}
        <button
          type="button"
          onClick={onBookAnother}
          className="h-10 w-full rounded-[4px] text-[15px] font-medium text-[#635BFF] hover:bg-[#F0EEFF] focus-visible:outline-2 focus-visible:outline-[#635BFF]"
        >
          Book another appointment
        </button>
      </div>
    </section>
  );
}
