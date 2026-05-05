"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Check, Search } from "lucide-react";

interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  value: PatientOption | null;
  onChange: (p: PatientOption | null) => void;
  disabled?: boolean;
}

export function PatientCombobox({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientOption[]>([]);
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
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = query.trim()
          ? `/api/patients?search=${encodeURIComponent(query.trim())}`
          : "/api/patients";
        const res = await fetch(url);
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(
          (data as Array<PatientOption>).slice(0, 20).map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
          })),
        );
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  const label = value ? `${value.firstName} ${value.lastName}` : "Select patient…";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex w-full h-9 items-center justify-between rounded-[4px] border border-[#e5edf5] bg-white px-3 text-[14px] text-[#061b31] hover:border-[#c1c9d2] focus:outline-none focus:ring-1 focus:ring-[#533afd] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className={value ? "" : "text-[#94a3b8]"}>{label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.75} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-10 z-30 rounded-[6px] border border-[#e5edf5] bg-white py-1"
          style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.06)" }}
        >
          <div className="px-2 pb-1 border-b border-[#e5edf5]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748d] pointer-events-none" strokeWidth={1.75} />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, IC, phone, email…"
                className="w-full h-8 pl-7 pr-2 text-[13px] border-0 focus:outline-none bg-transparent text-[#061b31] placeholder:text-[#94a3b8]"
              />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {loading && (
              <div className="px-3 py-2 text-[13px] text-[#64748d]">Loading…</div>
            )}
            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-[13px] text-[#64748d]">
                {query.trim() ? "No matches" : "Type to search"}
              </div>
            )}
            {!loading &&
              results.map((p) => {
                const selected = value?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-[#273951] hover:bg-[#f6f9fc] transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-[#061b31] truncate">
                        {p.firstName} {p.lastName}
                      </span>
                      {(p.phone || p.email) && (
                        <span className="block text-[12px] text-[#64748d] truncate">
                          {p.phone ?? p.email}
                        </span>
                      )}
                    </span>
                    {selected && <Check className="h-3.5 w-3.5 text-[#533afd]" strokeWidth={2} />}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
