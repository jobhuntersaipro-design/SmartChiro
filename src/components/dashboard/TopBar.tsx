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
        <Search className="absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#697386]" strokeWidth={2} />
        <input
          type="text"
          placeholder="Search patients, appointments, or invoices..."
          readOnly
          className="flex h-8 w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] pl-8 pr-3 text-[15px] text-[#0A2540] placeholder:text-[#697386] focus:outline-none focus:ring-1 focus:ring-[#635BFF] focus:border-[#635BFF] focus:bg-white transition-colors"
        />
      </div>

      {/* Center nav tabs */}
      <nav className="hidden md:flex items-center gap-0.5">
        {navTabs.map((tab, i) => (
          <button
            key={tab}
            className={cn(
              "rounded-[4px] px-3 py-1.5 text-[15px] font-medium transition-colors",
              i === 0
                ? "bg-[#F0EEFF] text-[#635BFF]"
                : "text-[#425466] hover:bg-[#F0F3F7] hover:text-[#0A2540]"
            )}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" className="gap-1.5 h-7 px-2.5 text-[15px] font-medium rounded-[4px]">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="hidden sm:inline">New</span>
        </Button>

        <button className="relative flex items-center justify-center h-8 w-8 rounded-[4px] text-[#697386] transition-colors hover:bg-[#F0F3F7] hover:text-[#0A2540]">
          <Bell className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2 ml-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-[#F0EEFF] text-[#635BFF] text-[13px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden lg:inline text-[15px] font-medium text-[#0A2540]">
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
