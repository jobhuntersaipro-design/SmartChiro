import { Globe } from "lucide-react";

/** Small pill for appointments the patient booked from the public booking page. */
export function OnlineBookingBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info-subtle px-2 py-0.5 text-[12px] font-medium text-info"
      title="Booked by the patient on the online booking page"
    >
      <Globe className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      Online
    </span>
  );
}
