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
        className="w-120 rounded-surface border border-border bg-white p-6"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-subtle">
            <AlertTriangle className="h-4.5 w-4.5 text-warning" strokeWidth={1.75} />
          </div>
          <div>
            <h2 id="conflict-override-title" className="text-[16px] font-medium text-foreground">Conflicting appointment</h2>
            <p className="text-[13px] text-fg-secondary mt-0.5">
              The new time overlaps with{" "}
              {conflicts.length === 1 ? "another booking" : `${conflicts.length} other bookings`} for this doctor.
            </p>
          </div>
        </div>

        <ul className="rounded-md border border-border bg-surface-muted divide-y divide-border mb-4 max-h-50 overflow-auto">
          {conflicts.map((c) => (
            <li key={c.id} className="px-3 py-2 text-[13px]">
              <span className="font-medium text-foreground">
                {c.patient.firstName} {c.patient.lastName}
              </span>
              <span className="text-fg-secondary tabular-nums">
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
            className="h-8 rounded-control border-border text-[14px]"
          >
            Cancel
          </Button>
          <Button
            onClick={onOverride}
            className="h-8 rounded-control bg-warning hover:bg-warning text-white text-[14px]"
          >
            Override and double-book
          </Button>
        </div>
      </div>
    </div>
  );
}
