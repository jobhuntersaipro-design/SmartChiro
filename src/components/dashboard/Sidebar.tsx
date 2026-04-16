"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,

  FileText,
  Settings,
  Plus,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Patients", href: "/dashboard/patients", icon: Users },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },

  { label: "Invoices", href: "/dashboard/invoices", icon: FileText },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-white transition-all duration-200",
        collapsed ? "w-[68px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-[52px] items-center gap-2.5 px-4 border-b border-border">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-primary text-primary-foreground text-[15px] font-semibold">
          SC
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold leading-tight text-[#061b31]">
              SmartChiro
            </span>
            <span className="text-[12px] font-medium tracking-[0.04em] text-[#64748d] uppercase">
              Health Center
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-3">
        <div className="space-y-[2px]">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[4px] px-2 py-[6px] text-[15px] transition-all duration-200",
                  isActive
                    ? "bg-[#ededfc] text-[#533afd] font-normal"
                    : "text-[#273951] hover:bg-[#f6f9fc] hover:text-[#061b31] font-normal hover:translate-x-0.5"
                )}
              >
                <item.icon
                  className="h-4 w-4 shrink-0"
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-3 space-y-[2px]">
        {/* New Appointment button */}
        <Button
          className={cn(
            "w-full justify-start gap-2 text-[15px] font-medium rounded-[4px]",
            collapsed && "justify-center px-0"
          )}
          size={collapsed ? "icon" : "default"}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
          {!collapsed && <span>New Appointment</span>}
        </Button>

        <div className="my-2 h-px bg-border" />

        {/* Profile */}
        <button className="flex w-full items-center gap-2.5 rounded-[4px] px-2 py-[6px] text-[15px] text-[#273951] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:translate-x-0.5">
          <User className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Profile</span>}
        </button>

        {/* Logout */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2.5 rounded-[4px] px-2 py-[6px] text-[15px] text-[#273951] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:translate-x-0.5"
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Logout</span>}
        </button>

        <div className="my-2 h-px bg-border" />

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-[4px] p-1.5 text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:scale-110 active:scale-95"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </aside>
  );
}
