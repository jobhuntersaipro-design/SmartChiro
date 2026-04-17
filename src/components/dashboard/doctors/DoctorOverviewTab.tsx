"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Clock, User, CalendarDays, FileText, ChevronRight,
} from "lucide-react";
import type { DoctorDetail, WorkingSchedule } from "@/types/doctor";

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
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return days[new Date().getDay()];
}

const statusColors: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: "bg-[#ededfc]", text: "text-[#533afd]" },
  CHECKED_IN: { bg: "bg-[rgba(21,190,83,0.15)]", text: "text-[#108c3d]" },
  IN_PROGRESS: { bg: "bg-[rgba(5,112,222,0.15)]", text: "text-[#0570DE]" },
  COMPLETED: { bg: "bg-[rgba(21,190,83,0.2)]", text: "text-[#108c3d]" },
  CANCELLED: { bg: "bg-[#F0F3F7]", text: "text-[#64748d]" },
  NO_SHOW: { bg: "bg-[rgba(223,27,65,0.12)]", text: "text-[#DF1B41]" },
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

  const schedule = (doctor.profile?.workingSchedule ?? null) as WorkingSchedule | null;
  const todayKey = getTodayDayKey();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Left column */}
      <div className="space-y-6">
        {/* Today's Agenda */}
        <div className="rounded-[6px] border border-[#e5edf5] bg-white">
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
              <h2 className="text-[16px] font-medium text-[#061b31]">Today&apos;s Agenda</h2>
              <span className="text-[13px] text-[#64748d] ml-auto">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
            </div>
          </div>
          <div className="divide-y divide-[#e5edf5]">
            {loadingAppts ? (
              <div className="px-5 py-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 bg-[#F6F9FC] rounded animate-pulse" />
                ))}
              </div>
            ) : appointments.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CalendarDays className="h-8 w-8 mx-auto text-[#e5edf5] mb-2" strokeWidth={1} />
                <p className="text-[14px] text-[#64748d]">No appointments scheduled for today</p>
              </div>
            ) : (
              appointments.map((a) => {
                const colors = statusColors[a.status] ?? statusColors.SCHEDULED;
                return (
                  <div key={a.id} className="px-5 py-3 flex items-center gap-4 hover:bg-[#F6F9FC] transition-colors">
                    <div className="w-20 shrink-0">
                      <span className="text-[14px] font-medium text-[#061b31]">{formatTime(a.dateTime)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-[#64748d] shrink-0" strokeWidth={1.5} />
                        <span className="text-[14px] text-[#061b31] truncate">
                          {a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "Unknown"}
                        </span>
                      </div>
                      {a.notes && (
                        <p className="text-[12px] text-[#64748d] truncate mt-0.5 ml-[22px]">{a.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[12px] text-[#64748d]">{a.duration}min</span>
                      <span className={`rounded-[4px] px-[6px] py-[1px] text-[11px] font-light ${colors.bg} ${colors.text}`}>
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
        <div className="rounded-[6px] border border-[#e5edf5] bg-white">
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#0570DE]" strokeWidth={1.5} />
              <h2 className="text-[16px] font-medium text-[#061b31]">Recent Visits</h2>
            </div>
          </div>
          <div className="divide-y divide-[#e5edf5]">
            {loadingVisits ? (
              <div className="px-5 py-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 bg-[#F6F9FC] rounded animate-pulse" />
                ))}
              </div>
            ) : visits.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <FileText className="h-8 w-8 mx-auto text-[#e5edf5] mb-2" strokeWidth={1} />
                <p className="text-[14px] text-[#64748d]">No visits recorded yet</p>
              </div>
            ) : (
              visits.map((v) => (
                <div key={v.id} className="px-5 py-3 hover:bg-[#F6F9FC] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
                      <span className="text-[14px] text-[#061b31]">
                        {v.patient ? `${v.patient.firstName} ${v.patient.lastName}` : "Unknown"}
                      </span>
                    </div>
                    <span className="text-[12px] text-[#64748d]">{formatDate(v.visitDate)}</span>
                  </div>
                  {v.assessment && (
                    <p className="text-[13px] text-[#64748d] line-clamp-2 ml-[22px]">{v.assessment}</p>
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
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3">
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
              <InfoRow label="Fee" value={`RM ${doctor.profile.consultationFee}`} />
            )}
          </div>
        </div>

        {/* Working Hours */}
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3">
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
                    className={`flex items-center justify-between text-[13px] rounded-[4px] px-2 py-1 ${
                      isToday ? "bg-[#ededfc]" : ""
                    }`}
                  >
                    <span className={`w-20 ${isToday ? "text-[#533afd] font-medium" : "text-[#64748d]"}`}>
                      {dayLabels[key]}
                    </span>
                    <span className={isToday ? "text-[#533afd] font-medium" : day ? "text-[#061b31]" : "text-[#c1c9d2]"}>
                      {day ? `${day.start} - ${day.end}` : "Off"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-[#64748d]">No schedule set</p>
          )}
        </div>

        {/* Branches */}
        {doctor.branches.length > 0 && (
          <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
            <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3">
              Branches
            </h3>
            <div className="space-y-2">
              {doctor.branches.map((b) => (
                <div key={b.id} className="flex items-center justify-between">
                  <Link
                    href={`/dashboard/branches/${b.id}`}
                    className="text-[14px] text-[#061b31] hover:text-[#533afd] transition-colors flex items-center gap-1"
                  >
                    {b.name}
                    <ChevronRight className="h-3 w-3 text-[#c1c9d2]" strokeWidth={1.5} />
                  </Link>
                  <span className="text-[12px] text-[#533afd] bg-[#ededfc] rounded-full px-2 py-0.5">
                    {b.role}
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
      <span className="text-[13px] text-[#64748d] shrink-0">{label}</span>
      <span className="text-[13px] text-[#061b31] text-right">{value}</span>
    </div>
  );
}
