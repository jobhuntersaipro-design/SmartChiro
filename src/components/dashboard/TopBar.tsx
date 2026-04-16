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
    <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-border bg-white px-5">
      {/* Search */}
      <div className="relative flex-1 max-w-[400px]">
        <Search className="absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#64748d]" strokeWidth={2} />
        <input
          type="text"
          placeholder="Search patients, appointments, or invoices..."
          readOnly
          className="flex h-8 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] pl-8 pr-3 text-[15px] text-[#061b31] placeholder:text-[#64748d] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors"
        />
      </div>

      {/* Center nav tabs */}
      <nav className="hidden md:flex items-center gap-0.5">
        {navTabs.map((tab, i) => (
          <button
            key={tab}
            className={cn(
              "rounded-[4px] px-3 py-1.5 text-[15px] font-normal transition-all duration-200",
              i === 0
                ? "bg-[#ededfc] text-[#533afd]"
                : "text-[#273951] hover:bg-[#f6f9fc] hover:text-[#061b31] hover:scale-105"
            )}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" className="gap-1.5 h-7 px-2.5 text-[15px] font-normal rounded-[4px]">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="hidden sm:inline">New</span>
        </Button>

        <button className="relative flex items-center justify-center h-8 w-8 rounded-[4px] text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:scale-110 active:scale-95">
          <Bell className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2 ml-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[13px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden lg:inline text-[15px] font-medium text-[#061b31]">
            {currentUser.name}
          </span>
        </div>
      </div>
    </header>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
