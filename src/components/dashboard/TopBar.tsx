"use client";

import { Search, Plus, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { currentUser } from "@/lib/mock-data";

const navTabs = ["Patients", "Schedule", "Reports"] as const;

export function TopBar() {
  const initials = currentUser.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-border bg-card px-5">
      {/* Search */}
      <div className="relative flex-1 max-w-[400px]">
        <Search className="absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--color-text-muted)]" strokeWidth={2} />
        <input
          type="text"
          placeholder="Search patients, appointments, or invoices..."
          readOnly
          className="flex h-8 w-full rounded-md border border-border bg-card pl-8 pr-3 text-[13px] text-foreground placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
        />
      </div>

      {/* Center nav tabs */}
      <nav className="hidden md:flex items-center gap-0.5">
        {navTabs.map((tab) => (
          <button
            key={tab}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[#F6F8FA] hover:text-foreground"
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" className="gap-1.5 h-7 px-2.5 text-[13px] font-medium">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="hidden sm:inline">New</span>
        </Button>

        <button className="relative flex items-center justify-center h-8 w-8 rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[#F6F8FA] hover:text-foreground">
          <Bell className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2 ml-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden lg:inline text-[13px] font-medium text-foreground">
            {currentUser.name}
          </span>
        </div>
      </div>
    </header>
  );
}
