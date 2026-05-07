"use client";

import { useRef } from "react";
import type {
  AppointmentTabId,
  AppointmentCounts,
} from "@/lib/appointment-tabs";

interface Props {
  active: AppointmentTabId;
  counts: AppointmentCounts;
  onChange: (tab: AppointmentTabId) => void;
}

const TABS: { id: AppointmentTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "noshow", label: "No-show" },
];

export function AppointmentTabs({ active, counts, onChange }: Props) {
  const refs = useRef<Map<AppointmentTabId, HTMLButtonElement>>(new Map());

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const idx = TABS.findIndex((t) => t.id === active);
    if (idx < 0) return;
    const nextIdx =
      e.key === "ArrowRight"
        ? (idx + 1) % TABS.length
        : (idx - 1 + TABS.length) % TABS.length;
    const nextTab = TABS[nextIdx].id;
    onChange(nextTab);
    e.preventDefault();
    requestAnimationFrame(() => refs.current.get(nextTab)?.focus());
  }

  return (
    <div
      role="tablist"
      aria-label="Appointment status"
      onKeyDown={handleKeyDown}
      className="flex items-center gap-1 border-b border-[#e5edf5] bg-white overflow-x-auto"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-label={`${tab.label}, ${count ?? 0} appointment${count === 1 ? "" : "s"}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`relative inline-flex items-center gap-2 px-4 h-11 text-[14px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#635BFF] ${
              isActive
                ? "text-[#635BFF] font-semibold"
                : "text-[#425466] font-medium hover:text-[#0A2540]"
            }`}
          >
            {tab.label}
            {isActive ? (
              <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full bg-[#F0EEFF] text-[12px] font-medium text-[#635BFF] tabular-nums">
                {count ?? 0}
              </span>
            ) : (
              <span className="text-[12px] text-[#697386] tabular-nums">
                ({count ?? 0})
              </span>
            )}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute left-3 right-3 -bottom-px h-[2px] bg-[#635BFF] transition-all"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
