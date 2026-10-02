"use client";

import { Search } from "lucide-react";

interface PatientSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function PatientSearch({ value, onChange }: PatientSearchProps) {
  return (
    <div className="relative flex-1 max-w-100">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-secondary" strokeWidth={2} />
      <input
        type="text"
        placeholder="Search patients by name, email, or phone..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-8 w-full rounded-md border border-border bg-surface-muted pl-8 pr-3 text-[15px] text-foreground placeholder:text-fg-secondary focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-colors"
      />
    </div>
  );
}
