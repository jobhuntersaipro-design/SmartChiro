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
  /** Only list clinicians of this branch. */
  branchId?: string;
}

export function DoctorCombobox({ value, onChange, disabled, branchId }: Props) {
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  // Which branch the loaded list belongs to ("" = all of the caller's branches)
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
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
    const scope = branchId ?? "";
    if (!open || loadedFor === scope) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const qs = branchId ? `&branchId=${encodeURIComponent(branchId)}` : "";
        const res = await fetch(`/api/doctors?clinical=1${qs}`);
        if (!res.ok) return;
        const data = (await res.json()) as { doctors?: Array<{ id: string; name: string | null }> };
        if (cancelled) return;
        setDoctors((data.doctors ?? []).map((d) => ({ id: d.id, name: d.name ?? "Unknown" })));
        setLoadedFor(scope);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, branchId, loadedFor]);

  const label = value?.name ?? "Select doctor…";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex w-full h-9 items-center justify-between rounded-md border border-border bg-white px-3 text-[14px] text-foreground hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 text-fg-secondary flex-shrink-0" strokeWidth={1.75} />
          <span className={`truncate ${value ? "" : "text-fg-muted"}`}>{label}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-fg-secondary flex-shrink-0" strokeWidth={1.75} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-10 z-30 rounded-panel border border-border bg-white py-1 max-h-65 overflow-y-auto"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          {loading && (
            <div className="px-3 py-2 text-[13px] text-fg-secondary">Loading…</div>
          )}
          {!loading && doctors.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-fg-secondary">No doctors found</div>
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
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-surface-muted transition-colors"
                >
                  <span className="truncate">{d.name}</span>
                  {selected && <Check className="h-3.5 w-3.5 text-brand flex-shrink-0" strokeWidth={2} />}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
