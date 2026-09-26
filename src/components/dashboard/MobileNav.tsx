"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Bone,
  Menu,
  Building2,
  Stethoscope,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Patients", href: "/dashboard/patients", icon: Users, exact: false },
  { label: "Schedule", href: "/dashboard/appointments", icon: Calendar, exact: false },
  { label: "Anatomy", href: "/dashboard/anatomy", icon: Bone, exact: false },
] as const;

const moreLinks = [
  { label: "Branches", href: "/dashboard/branches", icon: Building2 },
  { label: "Doctors", href: "/dashboard/doctors", icon: Stethoscope },
  { label: "Invoices", href: "/dashboard/invoices", icon: FileText },
] as const;

export function MobileNav({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePath, setMorePath] = useState(pathname);
  if (pathname !== morePath) {
    setMorePath(pathname);
    setMoreOpen(false);
  }

  const moreActive =
    moreLinks.some((item) => pathname.startsWith(item.href)) ||
    pathname.startsWith("/dashboard/settings");

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="animate-fade-overlay fixed inset-0 z-40 bg-[#061b31]/35 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}
      {moreOpen && (
        <div
          className="animate-sheet-up fixed inset-x-3 z-50 rounded-[8px] border border-[#e5edf5] bg-white p-2 shadow-lg md:hidden"
          style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
        >
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
            More
          </p>
          {moreLinks.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px] transition-colors active:scale-[0.99]",
                  active
                    ? "bg-[#ededfc] text-[#533afd]"
                    : "text-[#273951] hover:bg-[#f6f9fc]"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
          <Link
            href={`/dashboard/settings/${userId}`}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px] transition-colors active:scale-[0.99]",
              pathname.startsWith("/dashboard/settings")
                ? "bg-[#ededfc] text-[#533afd]"
                : "text-[#273951] hover:bg-[#f6f9fc]"
            )}
          >
            <Settings className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[15px] text-[#273951] transition-colors hover:bg-[#f6f9fc] active:scale-[0.99]"
          >
            <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            Log out
          </button>
        </div>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e5edf5] bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {tabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-transform active:scale-95"
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200",
                    active && "bg-[#ededfc]"
                  )}
                >
                  <tab.icon
                    className={cn("h-5 w-5", active ? "text-[#533afd]" : "text-[#64748d]")}
                    strokeWidth={active ? 2 : 1.75}
                  />
                </span>
                <span className={active ? "font-medium text-[#533afd]" : "text-[#64748d]"}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-label="More"
            onClick={() => setMoreOpen((open) => !open)}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-transform active:scale-95"
          >
            <span
              className={cn(
                "flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200",
                (moreOpen || moreActive) && "bg-[#ededfc]"
              )}
            >
              <Menu
                className={cn(
                  "h-5 w-5",
                  moreOpen || moreActive ? "text-[#533afd]" : "text-[#64748d]"
                )}
                strokeWidth={moreOpen || moreActive ? 2 : 1.75}
              />
            </span>
            <span
              className={
                moreOpen || moreActive ? "font-medium text-[#533afd]" : "text-[#64748d]"
              }
            >
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
