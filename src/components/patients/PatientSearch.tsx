"use client";

import { Search } from "lucide-react";

interface PatientSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function PatientSearch({ value, onChange }: PatientSearchProps) {
  return (
    <div className="relative flex-1 max-w-[400px]">
      <Search className="absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#697386]" strokeWidth={2} />
      <input
        type="text"
        placeholder="Search patients by name, email, or phone..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-8 w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] pl-8 pr-3 text-[15px] text-[#0A2540] placeholder:text-[#697386] focus:outline-none focus:ring-1 focus:ring-[#635BFF] focus:border-[#635BFF] focus:bg-white transition-colors"
      />
    </div>
  );
}
