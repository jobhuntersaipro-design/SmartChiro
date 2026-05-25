"use client";

import { Search } from "lucide-react";

export function TopBar() {
  return (
    <header className="flex h-13 shrink-0 items-center justify-center border-b border-border bg-white px-5">
      <div className="relative w-full max-w-120">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748d]" strokeWidth={2} />
        <input
          type="text"
          placeholder="Search patients, appointments, or invoices..."
          readOnly
          className="flex h-8 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] pl-9 pr-3 text-[15px] text-[#061b31] placeholder:text-[#64748d] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200"
        />
      </div>
    </header>
  );
}
