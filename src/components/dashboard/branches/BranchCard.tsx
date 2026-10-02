"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, MoreHorizontal, Pencil, Trash2, Stethoscope, Users, CalendarDays, Clock, MapPin } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BranchWithStats, OperatingHoursMap } from "@/types/branch";
import { parseOperatingHours, hoursForDay, summarizeOperatingHours } from "@/lib/operating-hours";
import { clinicParts } from "@/lib/clinic-time";

interface BranchCardProps {
  branch: BranchWithStats;
  userRole: string;
  onEdit: (branchId: string) => void;
  onDelete: (branchId: string) => void;
}

/** Open on today's clinic day (clinic time zone, not the device's). */
function isOpenToday(hours: OperatingHoursMap): boolean {
  return hoursForDay(hours, clinicParts(new Date()).weekday) !== null;
}

function getFullAddress(branch: BranchWithStats): string {
  const parts = [branch.address, branch.city, branch.state, branch.zip].filter(Boolean);
  return parts.join(", ") || "No address";
}

export function BranchCard({ branch, userRole, onEdit, onDelete }: BranchCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwner = userRole === "OWNER";
  const hours = parseOperatingHours(branch.operatingHours);
  const hoursSummary = summarizeOperatingHours(hours);
  const open = isOpenToday(hours);
  const canEditHours = userRole === "OWNER" || userRole === "ADMIN";

  return (
    <div
      className="rounded-panel border border-border bg-white transition-all duration-200 hover:border-border-strong cursor-pointer group"
      style={{
        boxShadow: "var(--shadow-lg)",
      }}
      onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-subtle">
              <Building2 className="h-4.5 w-4.5 text-brand" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[16px] font-medium text-foreground truncate">{branch.name}</h3>
              <div className="flex items-center gap-1 text-[13px] text-fg-secondary">
                <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{getFullAddress(branch)}</span>
              </div>
            </div>
          </div>

          {/* Actions menu — OWNER only per 2026-05-05 RBAC tightening */}
          {isOwner && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary hover:bg-surface-muted hover:text-foreground transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                  <div
                    className="absolute right-0 top-full mt-1 w-40 rounded-panel border border-border bg-white py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                    style={{ boxShadow: "var(--shadow-lg)" }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(branch.id); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-foreground hover:bg-surface-muted cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-fg-secondary" strokeWidth={1.5} />
                      Edit Branch
                    </button>
                    {isOwner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(branch.id); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-danger hover:bg-danger-subtle cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Delete Branch
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-1.5 text-[14px] text-foreground">
            <Stethoscope className="h-3.5 w-3.5 text-fg-secondary" strokeWidth={1.5} />
            <span>{branch.doctorCount} Doctor{branch.doctorCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[14px] text-foreground">
            <Users className="h-3.5 w-3.5 text-fg-secondary" strokeWidth={1.5} />
            <span>{branch.patientCount} Patient{branch.patientCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[14px] text-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-fg-secondary" strokeWidth={1.5} />
            <span>{branch.todayAppointments} today</span>
          </div>
        </div>
      </div>

      {/* Doctor avatars */}
      {branch.doctors.length > 0 && (
        <div className="px-5 pb-3">
          <div className="flex items-center">
            {branch.doctors.slice(0, 4).map((doc, i) => {
              const initials = (doc.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2);
              return (
                <Avatar key={doc.id} className="h-7 w-7 border-2 border-white" style={{ marginLeft: i > 0 ? "-6px" : 0 }}>
                  <AvatarFallback className="bg-brand-subtle text-brand text-[11px] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              );
            })}
            {branch.doctorCount > 4 && (
              <span className="ml-1.5 text-[13px] text-fg-secondary">+{branch.doctorCount - 4}</span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
        {hoursSummary ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg-secondary" title={hoursSummary}>
            <Clock className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{hoursSummary}</span>
          </div>
        ) : canEditHours ? (
          <Link
            href={`/dashboard/branches/${branch.id}?tab=settings`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[13px] font-medium text-warning hover:underline"
          >
            <Clock className="h-3 w-3" strokeWidth={1.5} />
            Set hours
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
            <Clock className="h-3 w-3" strokeWidth={1.5} />
            <span>No hours set</span>
          </div>
        )}
        {hoursSummary && (
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${
              open
                ? "bg-success-subtle text-success"
                : "bg-danger-subtle text-danger"
            }`}
          >
            {open ? "Open" : "Closed Today"}
          </span>
        )}
      </div>
    </div>
  );
}
