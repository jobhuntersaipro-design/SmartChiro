"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Check, User } from "lucide-react";

interface DoctorOption {
  id: string;
  name: string;
}

interface Props {
  value: DoctorOption | null;
  onChange: (d: DoctorOption | null) => void;
  disabled?: boolean;
}

export function DoctorCombobox({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open || doctors.length > 0) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/doctors");
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ id: string; name: string | null }>;
        if (cancelled) return;
        setDoctors(data.map((d) => ({ id: d.id, name: d.name ?? "Unknown" })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, doctors.length]);

  const label = value?.name ?? "Select doctor…";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex w-full h-9 items-center justify-between rounded-[4px] border border-[#e5edf5] bg-white px-3 text-[14px] text-[#061b31] hover:border-[#c1c9d2] focus:outline-none focus:ring-1 focus:ring-[#533afd] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 text-[#64748d] flex-shrink-0" strokeWidth={1.75} />
          <span className={`truncate ${value ? "" : "text-[#94a3b8]"}`}>{label}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-[#64748d] flex-shrink-0" strokeWidth={1.75} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-10 z-30 rounded-[6px] border border-[#e5edf5] bg-white py-1 max-h-[260px] overflow-y-auto"
          style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.06)" }}
        >
          {loading && (
            <div className="px-3 py-2 text-[13px] text-[#64748d]">Loading…</div>
          )}
          {!loading && doctors.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-[#64748d]">No doctors found</div>
          )}
          {!loading &&
            doctors.map((d) => {
              const selected = value?.id === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-[#273951] hover:bg-[#f6f9fc] transition-colors"
                >
                  <span className="truncate">{d.name}</span>
                  {selected && <Check className="h-3.5 w-3.5 text-[#533afd] flex-shrink-0" strokeWidth={2} />}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
