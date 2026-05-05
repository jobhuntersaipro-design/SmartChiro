"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, MoreHorizontal, Pencil, Trash2, Stethoscope, Users, CalendarDays, Clock, MapPin } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BranchWithStats, OperatingHoursMap } from "@/types/branch";

interface BranchCardProps {
  branch: BranchWithStats;
  userRole: string;
  onEdit: (branchId: string) => void;
  onDelete: (branchId: string) => void;
}

function getOperatingHoursSummary(hoursJson: string | null): string {
  if (!hoursJson) return "No hours set";
  try {
    const hours: OperatingHoursMap = JSON.parse(hoursJson);
    const days = Object.keys(hours) as (keyof OperatingHoursMap)[];
    if (days.length === 0) return "No hours set";

    const dayNames: Record<string, string> = {
      mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
    };
    const orderedDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    const activeDays = orderedDays.filter((d) => hours[d]);

    if (activeDays.length === 0) return "No hours set";

    // Check if all days have same hours
    const firstHours = hours[activeDays[0]];
    const allSame = activeDays.every((d) => hours[d]?.open === firstHours?.open && hours[d]?.close === firstHours?.close);

    if (allSame && firstHours) {
      // Find consecutive ranges
      const start = dayNames[activeDays[0]];
      const end = dayNames[activeDays[activeDays.length - 1]];
      const range = activeDays.length === 1 ? start : `${start}-${end}`;
      return `${range} ${firstHours.open}-${firstHours.close}`;
    }

    return `${activeDays.length} days/week`;
  } catch {
    return "No hours set";
  }
}

function isOpenToday(hoursJson: string | null): boolean {
  if (!hoursJson) return false;
  try {
    const hours: OperatingHoursMap = JSON.parse(hoursJson);
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const today = dayMap[new Date().getDay()];
    return !!hours[today];
  } catch {
    return false;
  }
}

function getFullAddress(branch: BranchWithStats): string {
  const parts = [branch.address, branch.city, branch.state, branch.zip].filter(Boolean);
  return parts.join(", ") || "No address";
}

export function BranchCard({ branch, userRole, onEdit, onDelete }: BranchCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwner = userRole === "OWNER";
  const open = isOpenToday(branch.operatingHours);

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white transition-all duration-200 hover:border-[#c1c9d2] cursor-pointer group"
      style={{
        boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
      }}
      onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] bg-[#ededfc]">
              <Building2 className="h-4.5 w-4.5 text-[#533afd]" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[16px] font-medium text-[#061b31] truncate">{branch.name}</h3>
              <div className="flex items-center gap-1 text-[13px] text-[#64748d]">
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
                className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[#64748d] hover:bg-[#f6f9fc] hover:text-[#061b31] transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                  <div
                    className="absolute right-0 top-full mt-1 w-40 rounded-[6px] border border-[#e5edf5] bg-white py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                    style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(branch.id); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-[#061b31] hover:bg-[#f6f9fc] cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
                      Edit Branch
                    </button>
                    {isOwner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(branch.id); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-[#DF1B41] hover:bg-[#FEF2F4] cursor-pointer"
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
          <div className="flex items-center gap-1.5 text-[14px] text-[#273951]">
            <Stethoscope className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
            <span>{branch.doctorCount} Doctor{branch.doctorCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[14px] text-[#273951]">
            <Users className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
            <span>{branch.patientCount} Patient{branch.patientCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[14px] text-[#273951]">
            <CalendarDays className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
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
                  <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[11px] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              );
            })}
            {branch.doctorCount > 4 && (
              <span className="ml-1.5 text-[13px] text-[#64748d]">+{branch.doctorCount - 4}</span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#e5edf5]">
        <div className="flex items-center gap-1.5 text-[13px] text-[#64748d]">
          <Clock className="h-3 w-3" strokeWidth={1.5} />
          <span>{getOperatingHoursSummary(branch.operatingHours)}</span>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${
            open
              ? "bg-[#ECFDF5] text-[#15be53]"
              : "bg-[#FEF2F4] text-[#DF1B41]"
          }`}
        >
          {open ? "Open" : "Closed Today"}
        </span>
      </div>
    </div>
  );
}
