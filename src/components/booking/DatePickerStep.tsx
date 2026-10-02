"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { keyToLocalDate, localDateToKey, monthKeyOf } from "@/lib/booking/date-keys";
import { useAvailableDays } from "./use-booking-data";
import { InlineAlert } from "./BookingParts";

interface Props {
  slug: string;
  treatment: string;
  doctorId: string;
  firstDay: string;
  lastDay: string;
  selected: string | null;
  onSelect: (dateKey: string) => void;
}

/** Month calendar; days without a free slot are disabled. */
export function DatePickerStep({ slug, treatment, doctorId, firstDay, lastDay, selected, onSelect }: Props) {
  const first = keyToLocalDate(firstDay);
  const last = keyToLocalDate(lastDay);
  const [month, setMonth] = useState<Date>(selected ? keyToLocalDate(selected) : first);
  const days = useAvailableDays({ slug, treatment, doctorId }, monthKeyOf(month));
  const available = days.data;
  const noneThisMonth = !days.loading && available !== null && available.size === 0;

  return (
    <div>
      {days.error && (
        <InlineAlert>
          {days.error === "rate_limited" ? "Too many requests — wait a moment and try again." : "Couldn't load available days. Check your connection and try again."}
        </InlineAlert>
      )}
      <div className="relative flex justify-center">
        <Calendar
          mode="single"
          selected={selected ? keyToLocalDate(selected) : undefined}
          onSelect={(d) => d && onSelect(localDateToKey(d))}
          month={month}
          onMonthChange={setMonth}
          startMonth={first}
          endMonth={last}
          today={first}
          showOutsideDays={false}
          weekStartsOn={1}
          disabled={(d) => {
            const key = localDateToKey(d);
            if (key < firstDay || key > lastDay) return true;
            return !available || !available.has(key);
          }}
          className="rounded-panel border border-border p-2 [--cell-size:--spacing(10)]"
          aria-busy={days.loading}
        />
        {days.loading && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[13px] text-fg-muted shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Checking availability…
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[13px] text-fg-muted" aria-live="polite">
        {noneThisMonth ? "No free times this month — try the next month." : "Dates you can't pick are fully booked or closed."}
      </p>
    </div>
  );
}
