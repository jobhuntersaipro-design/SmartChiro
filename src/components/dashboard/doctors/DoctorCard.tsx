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
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";
import { CertificateBadge } from "@/components/certificates/CertificateBadge";

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
  return d.toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE, month: "short", year: "numeric" });
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
      className="rounded-panel border border-border bg-white p-5 transition-all duration-200 hover:border-border-strong hover:translate-y-[-1px] cursor-pointer"
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
            <AvatarFallback className="bg-brand-subtle text-brand text-[13px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-medium text-foreground truncate">
                {doctor.name ?? "Unnamed"}
              </span>
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.25 text-[10px] font-medium ${
                  doctor.isActive
                    ? "bg-success/20 text-success border border-success/40"
                    : "bg-surface-hover text-fg-secondary"
                }`}
              >
                {doctor.isActive ? "Active" : "Inactive"}
              </span>
              <CertificateBadge expiresOn={doctor.apcExpiresOn} />
            </div>
            <div className="text-[13px] text-fg-secondary truncate">
              {doctor.email}
            </div>
            {doctor.specialties.length > 0 && (
              <div className="text-[13px] text-fg-secondary truncate mt-0.5">
                {doctor.specialties.join(", ")}
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-surface-muted transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4 text-fg-secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-panel border border-border shadow-md"
            >
              <DropdownMenuItem
                className="text-[14px] text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/dashboard/doctors/${doctor.id}`);
                }}
              >
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[14px] text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus(doctor);
                }}
              >
                {doctor.isActive ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[14px] text-danger cursor-pointer"
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
            className="flex-1 rounded-md bg-surface-muted px-3 py-2 text-center"
          >
            <div
              className="text-[16px] font-medium text-foreground"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {s.value}
            </div>
            <div className="text-[11px] text-fg-secondary">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3 w-3 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <div className="flex flex-wrap gap-1">
            {doctor.branches.map((b) => (
              <span
                key={b.id}
                className="text-[12px] text-brand bg-brand-subtle rounded-full px-2 py-0.5"
              >
                {b.name}
              </span>
            ))}
          </div>
        </div>
        <span className="text-[12px] text-border-strong shrink-0">
          Joined {formatDate(doctor.createdAt)}
        </span>
      </div>
    </div>
  );
}
