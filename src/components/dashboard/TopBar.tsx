"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";

export function TopBar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/dashboard/patients?search=${encodeURIComponent(q)}` : "/dashboard/patients");
  }

  return (
    <header className="flex h-13 shrink-0 items-center justify-center gap-2 border-b border-border bg-white px-3 md:px-5">
      {onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#425466] hover:bg-[#f6f9fc] md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>
      )}
      <form role="search" onSubmit={handleSubmit} className="relative w-full max-w-120">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748d]" strokeWidth={2} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search patients"
          placeholder="Search patients — name, IC or phone"
          className="flex h-8 w-full rounded-md border border-[#e5edf5] bg-[#f6f9fc] pl-9 pr-3 text-[15px] text-[#061b31] placeholder:text-[#64748d] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200"
        />
      </form>
    </header>
  );
}
