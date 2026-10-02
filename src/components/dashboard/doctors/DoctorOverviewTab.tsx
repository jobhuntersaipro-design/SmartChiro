"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Clock, User, CalendarDays, FileText, ChevronRight,
} from "lucide-react";
import type { DoctorDetail } from "@/types/doctor";
import { normalizeWorkingSchedule, DAY_KEYS_BY_WEEKDAY } from "@/lib/operating-hours";
import { clinicParts } from "@/lib/clinic-time";
import { formatMYR } from "@/lib/invoices";
import { roleLabel } from "@/lib/permissions";

interface DoctorOverviewTabProps {
  doctorId: string;
  doctor: DoctorDetail;
}

interface AppointmentItem {
  id: string;
  dateTime: string;
  duration: number;
  status: string;
  notes: string | null;
  patient: { id: string; firstName: string; lastName: string } | null;
  branch: { id: string; name: string } | null;
}

interface VisitItem {
  id: string;
  visitDate: string;
  subjective: string | null;
  assessment: string | null;
  patient: { id: string; firstName: string; lastName: string } | null;
}

const dayLabels: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function getTodayDayKey(): string {
  return DAY_KEYS_BY_WEEKDAY[clinicParts(new Date()).weekday];
}

const statusColors: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: "bg-brand-subtle", text: "text-brand" },
  CHECKED_IN: { bg: "bg-[rgba(21,190,83,0.15)]", text: "text-success" },
  IN_PROGRESS: { bg: "bg-[rgba(5,112,222,0.15)]", text: "text-info" },
  COMPLETED: { bg: "bg-[rgba(21,190,83,0.2)]", text: "text-success" },
  CANCELLED: { bg: "bg-surface-hover", text: "text-fg-secondary" },
  NO_SHOW: { bg: "bg-[rgba(223,27,65,0.12)]", text: "text-danger" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function DoctorOverviewTab({ doctorId, doctor }: DoctorOverviewTabProps) {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [loadingVisits, setLoadingVisits] = useState(true);

  useEffect(() => {
    fetch(`/api/doctors/${doctorId}/appointments?date=today`)
      .then((r) => r.json())
      .then((data) => setAppointments(data.appointments ?? []))
      .catch(() => setAppointments([]))
      .finally(() => setLoadingAppts(false));

    fetch(`/api/doctors/${doctorId}/visits?limit=5`)
      .then((r) => r.json())
      .then((data) => setVisits(data.visits ?? []))
      .catch(() => setVisits([]))
      .finally(() => setLoadingVisits(false));
  }, [doctorId]);

  const schedule = normalizeWorkingSchedule(doctor.profile?.workingSchedule);
  const todayKey = getTodayDayKey();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Left column */}
      <div className="space-y-6">
        {/* Today's Agenda */}
        <div className="rounded-panel border border-border bg-white">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-brand" strokeWidth={1.5} />
              <h2 className="text-[16px] font-medium text-foreground">Today&apos;s Agenda</h2>
              <span className="text-[13px] text-fg-secondary ml-auto">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {loadingAppts ? (
              <div className="px-5 py-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 bg-surface-muted rounded animate-pulse" />
                ))}
              </div>
            ) : appointments.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CalendarDays className="h-8 w-8 mx-auto text-border mb-2" strokeWidth={1} />
                <p className="text-[14px] text-fg-secondary">No appointments scheduled for today</p>
              </div>
            ) : (
              appointments.map((a) => {
                const colors = statusColors[a.status] ?? statusColors.SCHEDULED;
                return (
                  <div key={a.id} className="px-5 py-3 flex items-center gap-4 hover:bg-surface-muted transition-colors">
                    <div className="w-20 shrink-0">
                      <span className="text-[14px] font-medium text-foreground">{formatTime(a.dateTime)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-fg-secondary shrink-0" strokeWidth={1.5} />
                        <span className="text-[14px] text-foreground truncate">
                          {a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "Unknown"}
                        </span>
                      </div>
                      {a.notes && (
                        <p className="text-[12px] text-fg-secondary truncate mt-0.5 ml-5.5">{a.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[12px] text-fg-secondary">{a.duration}min</span>
                      <span className={`rounded-md px-1.5 py-0.25 text-[11px] font-light ${colors.bg} ${colors.text}`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Visits */}
        <div className="rounded-panel border border-border bg-white">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-info" strokeWidth={1.5} />
              <h2 className="text-[16px] font-medium text-foreground">Recent Visits</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {loadingVisits ? (
              <div className="px-5 py-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 bg-surface-muted rounded animate-pulse" />
                ))}
              </div>
            ) : visits.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <FileText className="h-8 w-8 mx-auto text-border mb-2" strokeWidth={1} />
                <p className="text-[14px] text-fg-secondary">No visits recorded yet</p>
              </div>
            ) : (
              visits.map((v) => (
                <div key={v.id} className="px-5 py-3 hover:bg-surface-muted transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-fg-secondary" strokeWidth={1.5} />
                      <span className="text-[14px] text-foreground">
                        {v.patient ? `${v.patient.firstName} ${v.patient.lastName}` : "Unknown"}
                      </span>
                    </div>
                    <span className="text-[12px] text-fg-secondary">{formatDate(v.visitDate)}</span>
                  </div>
                  {v.assessment && (
                    <p className="text-[13px] text-fg-secondary line-clamp-2 ml-5.5">{v.assessment}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-5">
        {/* Quick Info */}
        <div className="rounded-panel border border-border bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-foreground uppercase tracking-wide mb-3">
            Quick Info
          </h3>
          <div className="space-y-2.5">
            {doctor.profile?.licenseNumber && (
              <InfoRow label="License" value={doctor.profile.licenseNumber} />
            )}
            {doctor.profile?.yearsExperience != null && (
              <InfoRow label="Experience" value={`${doctor.profile.yearsExperience} years`} />
            )}
            {doctor.profile?.education && (
              <InfoRow label="Education" value={doctor.profile.education} />
            )}
            {doctor.profile?.treatmentRoom && (
              <InfoRow label="Room" value={doctor.profile.treatmentRoom} />
            )}
            {doctor.profile?.consultationFee != null && (
              <InfoRow label="Fee" value={formatMYR(Number(doctor.profile.consultationFee))} />
            )}
          </div>
        </div>

        {/* Working Hours */}
        <div className="rounded-panel border border-border bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-foreground uppercase tracking-wide mb-3">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
              Working Hours
            </div>
          </h3>
          {schedule ? (
            <div className="space-y-1.5">
              {dayKeys.map((key) => {
                const day = schedule[key];
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between text-[13px] rounded-md px-2 py-1 ${
                      isToday ? "bg-brand-subtle" : ""
                    }`}
                  >
                    <span className={`w-20 ${isToday ? "text-brand font-medium" : "text-fg-secondary"}`}>
                      {dayLabels[key]}
                    </span>
                    <span className={isToday ? "text-brand font-medium" : day ? "text-foreground" : "text-border-strong"}>
                      {day ? `${day.start} - ${day.end}` : "Off"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-fg-secondary">No schedule set</p>
          )}
        </div>

        {/* Branches */}
        {doctor.branches.length > 0 && (
          <div className="rounded-panel border border-border bg-white px-5 py-4">
            <h3 className="text-[13px] font-medium text-foreground uppercase tracking-wide mb-3">
              Branches
            </h3>
            <div className="space-y-2">
              {doctor.branches.map((b) => (
                <div key={b.id} className="flex items-center justify-between">
                  <Link
                    href={`/dashboard/branches/${b.id}`}
                    className="text-[14px] text-foreground hover:text-brand transition-colors flex items-center gap-1"
                  >
                    {b.name}
                    <ChevronRight className="h-3 w-3 text-border-strong" strokeWidth={1.5} />
                  </Link>
                  <span className="text-[12px] text-brand bg-brand-subtle rounded-full px-2 py-0.5">
                    {roleLabel(b.role)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[13px] text-fg-secondary shrink-0">{label}</span>
      <span className="text-[13px] text-foreground text-right">{value}</span>
    </div>
  );
}
