"use client";

import { Search } from "lucide-react";

interface PatientSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function PatientSearch({ value, onChange }: PatientSearchProps) {
  return (
    <div className="relative flex-1 max-w-[400px]">
      <Search className="absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#64748d]" strokeWidth={2} />
      <input
        type="text"
        placeholder="Search patients by name, email, or phone..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-8 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] pl-8 pr-3 text-[15px] text-[#061b31] placeholder:text-[#64748d] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors"
      />
    </div>
  );
}
