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
  BarChart3,
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
import { can, ROLE_LABELS, type Capability } from "@/lib/permissions";

const navItems: { label: string; href: string; icon: typeof Users; roles?: BranchRole[]; capability?: Capability }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Patients", href: "/dashboard/patients", icon: Users },
  { label: "Branches", href: "/dashboard/branches", icon: Building2 },
  // Staff management and clinical tools aren't front desk's job.
  { label: "Doctors", href: "/dashboard/doctors", icon: Stethoscope, roles: ["OWNER", "ADMIN", "DOCTOR"] },
  { label: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  // Billing is the owner's / front desk's job.
  { label: "Invoices", href: "/dashboard/invoices", icon: FileText, roles: ["OWNER", "ADMIN", "FRONT_DESK"] },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3, capability: "reports.read" },
  { label: "Anatomy", href: "/dashboard/anatomy", icon: Bone, roles: ["OWNER", "ADMIN", "DOCTOR"] },
];

interface SidebarUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  branchRole: BranchRole | null;
  activeBranchId: string | null;
  branches: { id: string; name: string; role: BranchRole }[];
  /** "All branches" scope is on / may be switched on. */
  allBranches?: boolean;
  canUseAllBranches?: boolean;
}

const ROLE_LABEL = ROLE_LABELS;

/** Which branch the dashboard works in; switching changes the role shown too. */
function BranchSwitcher({ user }: { user: SidebarUser }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const active = user.branches.find((b) => b.id === user.activeBranchId) ?? user.branches[0];
  if (!active) {
    return (
      <span className="text-[12px] font-medium tracking-[0.04em] text-fg-secondary uppercase">Health Center</span>
    );
  }
  const allOn = !!user.allBranches;
  const current = allOn ? "All branches" : active.name;
  const label = (
    <span
      className="block truncate text-[13px] text-fg-secondary"
      title={allOn ? `All branches (${user.branches.length})` : `${active.name} · ${ROLE_LABEL[active.role]}`}
    >
      {current}
    </span>
  );
  if (user.branches.length < 2) return label;

  // "all" = every branch the user belongs to (owners/admins of 2+ branches).
  async function switchTo(branchId: string) {
    if (allOn ? branchId === "all" : branchId === active.id) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/me/active-branch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      if (!res.ok) throw new Error();
      const name = branchId === "all" ? "all branches" : user.branches.find((b) => b.id === branchId)?.name ?? "branch";
      toast.success(`Switched to ${name}`);
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
        aria-label={`Branch: ${current}. Switch branch`}
        className="flex w-full min-w-0 items-center gap-1 rounded-control text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
      >
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {user.canUseAllBranches && (
          <>
            <DropdownMenuItem onClick={() => void switchTo("all")} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-foreground">All branches</span>
                <span className="block text-[12px] text-fg-secondary">{user.branches.length} branches</span>
              </span>
              {allOn && <Check className="h-4 w-4 text-brand" strokeWidth={2} />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {user.branches.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => void switchTo(b.id)} className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-foreground">{b.name}</span>
              <span className="block text-[12px] text-fg-secondary">{ROLE_LABEL[b.role]}</span>
            </span>
            {!allOn && b.id === active.id && <Check className="h-4 w-4 text-brand" strokeWidth={2} />}
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

/** The active branch's role grants it, or — in "All branches" — any member branch's role does. */
function hasCapabilityInScope(user: SidebarUser, capability: Capability): boolean {
  if (can(user.branchRole, capability)) return true;
  return !!user.allBranches && user.branches.some((b) => can(b.role, capability));
}

export function Sidebar({ collapsed, onToggle, user }: SidebarProps) {
  const pathname = usePathname();
  const initials = getInitials(user.name, user.email);
  const isOwner = user.branchRole === "OWNER";

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-surface-subtle transition-all duration-200",
        collapsed ? "w-17" : "w-55"
      )}
    >
      {/* Logo */}
      <div className="flex h-13 items-center gap-2.5 px-4 border-b border-border">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold tracking-tight">
          SC
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-heading text-[15px] font-semibold leading-tight tracking-tight text-foreground">
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
            .filter((item) => !item.capability || hasCapabilityInScope(user, item.capability))
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
                  "flex items-center gap-2.5 rounded-control px-3 py-1.75 text-[15px] transition-colors duration-150 ease-standard",
                  isActive
                    ? "bg-surface text-foreground font-medium shadow-(--shadow-resting) ring-1 ring-border"
                    : "text-fg-secondary hover:bg-surface-hover hover:text-foreground"
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
            "w-full justify-start gap-2 text-[15px] font-medium",
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
              "flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors duration-150 hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              collapsed && "justify-center px-0"
            )}
          >
            <Avatar size="sm">
              {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
              <AvatarFallback className="bg-brand-subtle text-brand text-[11px] font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-medium text-foreground truncate" title={user.name ?? user.email}>
                      {user.name ?? user.email}
                    </span>
                    {isOwner && (
                      <span className="shrink-0 rounded-full bg-brand-subtle px-1.5 py-0.25 text-[10px] font-medium text-brand">
                        Owner
                      </span>
                    )}
                  </div>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-50"
          >
            <div className="px-3 py-2">
              <p className="text-[14px] font-medium text-foreground truncate">
                {user.name ?? "User"}
              </p>
              <p className="text-[12px] text-fg-secondary truncate">
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <Link href={`/dashboard/settings/${user.id}`}>
              <DropdownMenuItem className="gap-2 text-[14px] text-foreground cursor-pointer">
                <Settings className="h-4 w-4" strokeWidth={1.5} />
                Settings
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-[14px] text-foreground cursor-pointer"
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
          className="flex w-full items-center justify-center rounded-control p-1.5 text-fg-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-foreground active:scale-95"
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
