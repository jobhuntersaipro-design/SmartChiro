"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  ScanLine,
  FileText,
  Settings,
  Plus,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Patients", href: "/dashboard/patients", icon: Users },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "X-Rays", href: "/dashboard/xrays", icon: ScanLine },
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
        "flex h-screen flex-col border-r border-border bg-card transition-all duration-200",
        collapsed ? "w-[68px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
          SC
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold leading-tight text-foreground">
              SmartChiro
            </span>
            <span className="text-[10px] font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
              Health Center
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-2">
        <div className="space-y-0.5">
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
                  "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                  isActive
                    ? "bg-[#F0EEFF] text-primary font-medium"
                    : "text-[var(--color-text-secondary)] hover:bg-[#F6F8FA] hover:text-foreground font-normal"
                )}
              >
                <item.icon
                  className="h-[16px] w-[16px] shrink-0"
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-3 space-y-1">
        {/* New Appointment button */}
        <Button
          className={cn(
            "w-full justify-start gap-2 text-[13px] font-medium",
            collapsed && "justify-center px-0"
          )}
          size={collapsed ? "icon" : "default"}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
          {!collapsed && <span>New Appointment</span>}
        </Button>

        <div className="my-2 h-px bg-border" />

        {/* Profile */}
        <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[#F6F8FA] hover:text-foreground">
          <User className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Profile</span>}
        </button>

        {/* Logout */}
        <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[#F6F8FA] hover:text-foreground">
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Logout</span>}
        </button>

        <div className="my-2 h-px bg-border" />

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[#F6F8FA] hover:text-foreground"
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
