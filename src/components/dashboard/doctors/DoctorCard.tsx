"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, MapPin } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DoctorListItem } from "@/types/doctor";

interface DoctorCardProps {
  doctor: DoctorListItem;
  isAdmin: boolean;
  onToggleStatus: (doctor: DoctorListItem) => void;
  onRemove: (doctor: DoctorListItem) => void;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function DoctorCard({
  doctor,
  isAdmin,
  onToggleStatus,
  onRemove,
}: DoctorCardProps) {
  const router = useRouter();
  const initials = getInitials(doctor.name, doctor.email);

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white p-5 transition-all duration-200 hover:border-[#c1c9d2] hover:translate-y-[-1px] cursor-pointer"
      style={{ boxShadow: "rgba(23,23,23,0.08) 0px 15px 35px" }}
      onClick={() => router.push(`/dashboard/doctors/${doctor.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <Avatar className="h-11 w-11 shrink-0 transition-transform duration-200 hover:scale-105">
            {doctor.image && (
              <AvatarImage src={doctor.image} alt={doctor.name ?? "Doctor"} />
            )}
            <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[13px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-medium text-[#061b31] truncate">
                {doctor.name ?? "Unnamed"}
              </span>
              <span
                className={`shrink-0 rounded-[4px] px-[6px] py-[1px] text-[10px] font-light ${
                  doctor.isActive
                    ? "bg-[rgba(21,190,83,0.2)] text-[#108c3d] border border-[rgba(21,190,83,0.4)]"
                    : "bg-[#F0F3F7] text-[#64748d]"
                }`}
              >
                {doctor.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="text-[13px] text-[#64748d] truncate">
              {doctor.email}
            </div>
            {doctor.specialties.length > 0 && (
              <div className="text-[13px] text-[#64748d] truncate mt-0.5">
                {doctor.specialties.join(", ")}
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-8 w-8 flex items-center justify-center rounded-[4px] hover:bg-[#f6f9fc] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4 text-[#64748d]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-[6px] border border-[#e5edf5] shadow-md"
            >
              <DropdownMenuItem
                className="text-[14px] text-[#273951] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/dashboard/doctors/${doctor.id}`);
                }}
              >
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[14px] text-[#273951] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus(doctor);
                }}
              >
                {doctor.isActive ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[14px] text-[#df1b41] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(doctor);
                }}
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-2 mb-3">
        {[
          { label: "Patients", value: doctor.stats.patientCount },
          { label: "Visits", value: doctor.stats.visitCount },
          { label: "X-rays", value: doctor.stats.xrayCount },
        ].map((s) => (
          <div
            key={s.label}
            className="flex-1 rounded-[4px] bg-[#F6F9FC] px-3 py-2 text-center"
          >
            <div
              className="text-[16px] font-medium text-[#061b31]"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {s.value}
            </div>
            <div className="text-[11px] text-[#64748d]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3 w-3 shrink-0 text-[#64748d]" strokeWidth={1.5} />
          <div className="flex flex-wrap gap-1">
            {doctor.branches.map((b) => (
              <span
                key={b.id}
                className="text-[12px] text-[#533afd] bg-[#ededfc] rounded-full px-2 py-0.5"
              >
                {b.name}
              </span>
            ))}
          </div>
        </div>
        <span className="text-[12px] text-[#c1c9d2] shrink-0">
          Joined {formatDate(doctor.createdAt)}
        </span>
      </div>
    </div>
  );
}
