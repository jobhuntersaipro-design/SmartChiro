"use client";

import { Loader2 } from "lucide-react";
import type { PublicSlot } from "@/types/booking";
import { InlineAlert } from "./BookingParts";

interface Props {
  slots: PublicSlot[] | null;
  loading: boolean;
  error: string | null;
  selected: string | null;
  timeZoneLabel: string;
  onSelect: (slot: PublicSlot) => void;
}

function groupOf(label: string): "Morning" | "Afternoon" | "Evening" {
  const m = /^(\d{1,2}):\d{2}\s*(AM|PM)$/i.exec(label);
  if (!m) return "Morning";
  let hour = Number(m[1]) % 12;
  if (m[2].toUpperCase() === "PM") hour += 12;
  if (hour < 12) return "Morning";
  return hour < 17 ? "Afternoon" : "Evening";
}

/** Free start times for the chosen day, grouped by part of day. */
export function TimeSlotStep({ slots, loading, error, selected, timeZoneLabel, onSelect }: Props) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-[15px] text-[#697386]" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Finding free times…
      </p>
    );
  }
  if (error) {
    return <InlineAlert>{error === "rate_limited" ? "Too many requests — wait a moment and try again." : "Couldn't load times. Try again."}</InlineAlert>;
  }
  if (!slots || slots.length === 0) {
    return <p className="py-4 text-[15px] text-[#425466]">No free times left on this day. Go back and pick another date.</p>;
  }

  const groups = (["Morning", "Afternoon", "Evening"] as const)
    .map((name) => ({ name, items: slots.filter((s) => groupOf(s.label) === name) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <p className="mb-3 text-[13px] text-[#697386]">Times are in {timeZoneLabel}.</p>
      <div className="space-y-4">
        {groups.map((g) => (
          <fieldset key={g.name}>
            <legend className="mb-1.5 text-[14px] font-medium text-[#425466]">{g.name}</legend>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map((s) => {
                const on = selected === s.start;
                return (
                  <button
                    key={s.start}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onSelect(s)}
                    className={`h-11 rounded-[4px] border text-[15px] font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#635BFF] ${
                      on
                        ? "border-[#635BFF] bg-[#635BFF] text-white"
                        : "border-[#E3E8EE] bg-white text-[#0A2540] hover:border-[#635BFF] hover:text-[#635BFF]"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
