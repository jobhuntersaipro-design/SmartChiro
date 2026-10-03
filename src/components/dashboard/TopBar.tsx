"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const LONG_PLACEHOLDER = "Search patients — name, IC or phone";

export function TopBar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // The long hint doesn't fit a phone; start short (SSR-safe) and widen on larger screens.
  const placeholder = useMediaQuery("(min-width: 640px)") ? LONG_PLACEHOLDER : "Search";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/dashboard/patients?search=${encodeURIComponent(q)}` : "/dashboard/patients");
  }

  return (
    <header className="flex h-13 shrink-0 items-center justify-center gap-2 border-b border-border bg-surface px-3 md:px-5">
      {onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-hover md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>
      )}
      <form role="search" onSubmit={handleSubmit} className="relative w-full max-w-120">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-secondary" strokeWidth={2} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search patients"
          placeholder={placeholder}
          className="flex h-9 w-full rounded-control border border-transparent bg-surface-muted pl-9 pr-3 text-[15px] text-foreground placeholder:text-fg-muted focus:outline-none focus:ring-3 focus:ring-ring/15 focus:border-brand focus:bg-surface transition-colors duration-150"
        />
      </form>
    </header>
  );
}
