"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DoctorListItem } from "@/types/doctor";
import type { DoctorDetail, WorkingSchedule } from "@/types/doctor";
import { useState, useEffect } from "react";

interface DoctorDetailSheetProps {
  doctor: DoctorListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
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

const dayLabels: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export function DoctorDetailSheet({
  doctor,
  open,
  onOpenChange,
  isAdmin,
  onRemove,
}: DoctorDetailSheetProps) {
  const [detail, setDetail] = useState<DoctorDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doctor || !open) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`/api/doctors/${doctor.id}`)
      .then((r) => r.json())
      .then((data) => setDetail(data.doctor ?? null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [doctor, open]);

  if (!doctor) return null;

  const initials = getInitials(doctor.name, doctor.email);
  const schedule = (detail?.profile?.workingSchedule ?? null) as WorkingSchedule | null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] border-l border-[#e5edf5] p-0 overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {doctor.image && (
                  <AvatarImage
                    src={doctor.image}
                    alt={doctor.name ?? "Doctor"}
                  />
                )}
                <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[14px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <SheetTitle className="text-[18px] font-light text-[#061b31]">
                  {doctor.name ?? "Unnamed"}
                </SheetTitle>
                <p className="text-[14px] text-[#64748d]">{doctor.email}</p>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-[4px] p-1 hover:bg-[#f6f9fc] transition-colors"
            >
              <X className="h-4 w-4 text-[#64748d]" />
            </button>
          </div>
        </SheetHeader>

        <div className="px-6 pb-6">
          {/* Stats */}
          <div className="flex gap-2 mb-5">
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

          {/* Status */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-[13px] text-[#64748d]">Status</span>
            <span
              className={`rounded-[4px] px-[6px] py-[1px] text-[11px] font-light ${
                doctor.isActive
                  ? "bg-[rgba(21,190,83,0.2)] text-[#108c3d] border border-[rgba(21,190,83,0.4)]"
                  : "bg-[#F0F3F7] text-[#64748d]"
              }`}
            >
              {doctor.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-4 bg-[#F6F9FC] rounded animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* Professional */}
              {detail?.profile && (
                <div className="mb-5">
                  <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
                    Professional
                  </h3>
                  <div className="space-y-2">
                    {detail.profile.licenseNumber && (
                      <Row
                        label="License"
                        value={detail.profile.licenseNumber}
                      />
                    )}
                    {detail.profile.education && (
                      <Row
                        label="Education"
                        value={detail.profile.education}
                      />
                    )}
                    {detail.profile.yearsExperience != null && (
                      <Row
                        label="Experience"
                        value={`${detail.profile.yearsExperience} years`}
                      />
                    )}
                    {detail.profile.specialties.length > 0 && (
                      <Row
                        label="Specialties"
                        value={detail.profile.specialties.join(", ")}
                      />
                    )}
                    {detail.profile.languages.length > 0 && (
                      <Row
                        label="Languages"
                        value={detail.profile.languages.join(", ")}
                      />
                    )}
                    {detail.profile.insurancePlans.length > 0 && (
                      <Row
                        label="Insurance"
                        value={detail.profile.insurancePlans.join(", ")}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Branches */}
              <div className="mb-5">
                <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
                  Branches
                </h3>
                <div className="space-y-2">
                  {doctor.branches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between"
                    >
                      <span className="text-[14px] text-[#061b31]">
                        {b.name}
                      </span>
                      <span className="text-[12px] text-[#533afd] bg-[#ededfc] rounded-full px-2 py-0.5">
                        {b.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Schedule */}
              {schedule && (
                <div className="mb-5">
                  <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
                    Schedule
                  </h3>
                  <div className="space-y-1.5">
                    {Object.entries(dayLabels).map(([key, label]) => {
                      const day = schedule[key as keyof WorkingSchedule];
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between text-[13px]"
                        >
                          <span className="text-[#64748d] w-10">{label}</span>
                          <span className="text-[#061b31]">
                            {day
                              ? `${day.start} - ${day.end}`
                              : "Off"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-6 pt-4 border-t border-[#e5edf5]">
            <Link href={`/dashboard/settings/${doctor.id}`} className="flex-1">
              <Button
                variant="outline"
                className="w-full h-9 rounded-[4px] text-[14px] border-[#e5edf5]"
              >
                Edit Profile
              </Button>
            </Link>
            {isAdmin && (
              <Button
                variant="ghost"
                onClick={() => onRemove(doctor)}
                className="h-9 rounded-[4px] text-[14px] text-[#df1b41] hover:bg-[#FEF2F4] hover:text-[#df1b41]"
              >
                Remove from Branch
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[13px] text-[#64748d] shrink-0">{label}</span>
      <span className="text-[14px] text-[#061b31] text-right">{value}</span>
    </div>
  );
}
