"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConflictItem } from "@/types/appointment";
import { clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";

interface Props {
  conflicts: ConflictItem[];
  onOverride: () => void;
  onCancel: () => void;
}

export function ConflictOverrideDialog({ conflicts, onOverride, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-override-title"
        onClick={(e) => e.stopPropagation()}
        className="w-120 rounded-2xl border border-[#e5edf5] bg-white p-6"
        style={{ boxShadow: "0 12px 40px rgba(18,42,66,0.15)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF8E1]">
            <AlertTriangle className="h-4.5 w-4.5 text-[#9b6829]" strokeWidth={1.75} />
          </div>
          <div>
            <h2 id="conflict-override-title" className="text-[16px] font-medium text-[#0A2540]">Conflicting appointment</h2>
            <p className="text-[13px] text-[#64748d] mt-0.5">
              The new time overlaps with{" "}
              {conflicts.length === 1 ? "another booking" : `${conflicts.length} other bookings`} for this doctor.
            </p>
          </div>
        </div>

        <ul className="rounded-md border border-[#e5edf5] bg-[#F6F9FC] divide-y divide-[#e5edf5] mb-4 max-h-50 overflow-auto">
          {conflicts.map((c) => (
            <li key={c.id} className="px-3 py-2 text-[13px]">
              <span className="font-medium text-[#061b31]">
                {c.patient.firstName} {c.patient.lastName}
              </span>
              <span className="text-[#64748d] tabular-nums">
                {" · "}
                {clinicDateLabel(new Date(c.dateTime), "short")} {clinicTimeLabel(new Date(c.dateTime))}
                {" · "}
                {c.duration}m
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="h-8 rounded-md border-[#e5edf5] text-[14px]"
          >
            Cancel
          </Button>
          <Button
            onClick={onOverride}
            className="h-8 rounded-md bg-[#9b6829] hover:bg-[#7d5520] text-white text-[14px]"
          >
            Override and double-book
          </Button>
        </div>
      </div>
    </div>
  );
}
