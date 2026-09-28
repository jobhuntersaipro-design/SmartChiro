"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  Plus,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Building2,
  Stethoscope,
  Bone,
  Check,
  FileText,
} from "lucide-react";
import { signOut } from "next-auth/react";
import type { BranchRole } from "@prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navItems: { label: string; href: string; icon: typeof Users; roles?: BranchRole[] }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Patients", href: "/dashboard/patients", icon: Users },
  { label: "Branches", href: "/dashboard/branches", icon: Building2 },
  { label: "Doctors", href: "/dashboard/doctors", icon: Stethoscope },
  { label: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  // Billing is the owner's / front desk's job.
  { label: "Invoices", href: "/dashboard/invoices", icon: FileText, roles: ["OWNER", "ADMIN"] },
  { label: "Anatomy", href: "/dashboard/anatomy", icon: Bone },
];

interface SidebarUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  branchRole: BranchRole | null;
  activeBranchId: string | null;
  branches: { id: string; name: string; role: BranchRole }[];
}

const ROLE_LABEL: Record<BranchRole, string> = { OWNER: "Owner", ADMIN: "Admin", DOCTOR: "Doctor" };

/** Which branch the dashboard works in; switching changes the role shown too. */
function BranchSwitcher({ user }: { user: SidebarUser }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const active = user.branches.find((b) => b.id === user.activeBranchId) ?? user.branches[0];
  if (!active) {
    return (
      <span className="text-[12px] font-medium tracking-[0.04em] text-[#64748d] uppercase">Health Center</span>
    );
  }
  const label = (
    <span className="block truncate text-[13px] text-[#64748d]" title={`${active.name} · ${ROLE_LABEL[active.role]}`}>
      {active.name}
    </span>
  );
  if (user.branches.length < 2) return label;

  async function switchTo(branchId: string) {
    if (branchId === active.id) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/me/active-branch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Switched to ${user.branches.find((b) => b.id === branchId)?.name ?? "branch"}`);
      router.refresh();
    } catch {
      toast.error("Couldn't switch branch.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={switching}
        aria-label={`Branch: ${active.name}. Switch branch`}
        className="flex w-full min-w-0 items-center gap-1 rounded-[4px] text-left hover:text-[#061b31] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#533afd]"
      >
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[#64748d]" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {user.branches.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => void switchTo(b.id)} className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-[#061b31]">{b.name}</span>
              <span className="block text-[12px] text-[#64748d]">{ROLE_LABEL[b.role]}</span>
            </span>
            {b.id === active.id && <Check className="h-4 w-4 text-[#533afd]" strokeWidth={2} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user: SidebarUser;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function Sidebar({ collapsed, onToggle, user }: SidebarProps) {
  const pathname = usePathname();
  const initials = getInitials(user.name, user.email);
  const isOwner = user.branchRole === "OWNER";

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-white transition-all duration-200",
        collapsed ? "w-17" : "w-55"
      )}
    >
      {/* Logo */}
      <div className="flex h-13 items-center gap-2.5 px-4 border-b border-border">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-[15px] font-semibold">
          SC
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-semibold leading-tight text-[#061b31]">
              SmartChiro
            </span>
            <BranchSwitcher user={user} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-3">
        <div className="space-y-0.5">
          {navItems
            .filter((item) => !item.roles || (user.branchRole !== null && item.roles.includes(user.branchRole)))
            .map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px] transition-all duration-200",
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
      <div className="px-3 pb-3 space-y-0.5">
        {/* New Appointment — opens the create dialog on the Appointments page */}
        <Link
          href="/dashboard/appointments?create=1"
          aria-label={collapsed ? "New Appointment" : undefined}
          title={collapsed ? "New Appointment" : undefined}
          className={cn(
            buttonVariants({ size: collapsed ? "icon" : "default" }),
            "w-full justify-start gap-2 text-[15px] font-medium rounded-md",
            collapsed && "justify-center px-0"
          )}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
          {!collapsed && <span>New Appointment</span>}
        </Link>

        <div className="my-2 h-px bg-border" />

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 transition-all duration-200 hover:bg-[#f6f9fc] outline-none",
              collapsed && "justify-center px-0"
            )}
          >
            <Avatar size="sm">
              {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
              <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[11px] font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-medium text-[#061b31] truncate" title={user.name ?? user.email}>
                      {user.name ?? user.email}
                    </span>
                    {isOwner && (
                      <span className="shrink-0 rounded-full bg-[#ededfc] px-1.5 py-0.25 text-[10px] font-medium text-[#533afd]">
                        Owner
                      </span>
                    )}
                  </div>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[#64748d]" strokeWidth={1.5} />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-50 rounded-[6px] border border-[#e5edf5] shadow-md"
          >
            <div className="px-3 py-2">
              <p className="text-[14px] font-medium text-[#061b31] truncate">
                {user.name ?? "User"}
              </p>
              <p className="text-[12px] text-[#64748d] truncate">
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <Link href={`/dashboard/settings/${user.id}`}>
              <DropdownMenuItem className="gap-2 text-[14px] text-[#273951] cursor-pointer">
                <Settings className="h-4 w-4" strokeWidth={1.5} />
                Settings
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-[14px] text-[#273951] cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="my-2 h-px bg-border" />

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center justify-center rounded-md p-1.5 text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:scale-110 active:scale-95"
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
