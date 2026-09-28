"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  changeAppointmentStatus,
  nextStatusActions,
  type AppointmentStatus,
  type StatusAction,
} from "@/lib/appointment-status-actions";

const TONE: Record<StatusAction["tone"], string> = {
  primary: "border-[#e5edf5] text-[#533afd] hover:bg-[#f0eeff]",
  success: "border-[#e5edf5] text-[#108c3d] hover:bg-[#ecfbf0]",
  danger: "border-[#e5edf5] text-[#DF1B41] hover:bg-[#fff0f3]",
};

interface Props {
  appointmentId: string;
  status: AppointmentStatus;
  dateTime: string;
  /** Called after a successful change so the owner can refetch. */
  onChanged: () => void;
  size?: "sm" | "xs";
}

/** One-click Check in / Start / Complete / No-show for the appointment's current state. */
export function AppointmentStatusActions({ appointmentId, status, dateTime, onChanged, size = "sm" }: Props) {
  const [pending, setPending] = useState<AppointmentStatus | null>(null);
  const actions = nextStatusActions(status, new Date(dateTime));
  if (actions.length === 0) return null;

  async function run(next: AppointmentStatus) {
    setPending(next);
    const result = await changeAppointmentStatus(appointmentId, next);
    setPending(null);
    if (result.ok) {
      toast.success(result.message);
      onChanged();
    } else {
      toast.error(result.message);
    }
  }

  const sizing = size === "xs" ? "h-7 px-2 text-[12px]" : "h-8 px-3 text-[13px]";

  return (
    <>
      {actions.map((action) => (
        <button
          key={action.status}
          type="button"
          disabled={pending !== null}
          onClick={(e) => {
            e.stopPropagation();
            void run(action.status);
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border bg-white font-medium transition-colors disabled:opacity-60 ${sizing} ${TONE[action.tone]}`}
        >
          {pending === action.status && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />}
          {action.label}
        </button>
      ))}
    </>
  );
}
