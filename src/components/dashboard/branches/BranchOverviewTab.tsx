"use client";

import { useState, useEffect } from "react";
import { Clock, Building2, Stethoscope, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BranchDetail, BranchStats, OperatingHoursMap } from "@/types/branch";
import { ScheduleTable } from "../shared/ScheduleTable";
import type { ScheduleAppointment as DashScheduleAppointment } from "../shared/ScheduleTable";

interface BranchOverviewTabProps {
  branch: BranchDetail;
  stats: BranchStats | null;
}

const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function BranchOverviewTab({ branch, stats }: BranchOverviewTabProps) {
  const [appointments, setAppointments] = useState<DashScheduleAppointment[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  useEffect(() => {
    async function fetchSchedule() {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);
        const res = await fetch(
          `/api/branches/${branch.id}/schedule?start=${todayStart.toISOString()}&end=${todayEnd.toISOString()}`
        );
        if (res.ok) {
          const data = await res.json();
          setAppointments(
            data.appointments
              .filter(
                (a: { patient: { id?: string; firstName: string; lastName: string } | null }) =>
                  !!a.patient,
              )
              .map(
                (a: {
                  id: string;
                  dateTime: string;
                  duration: number;
                  status: string;
                  notes: string | null;
                  patient: { id: string; firstName: string; lastName: string };
                  doctor: { id: string; name: string | null } | null;
                }) => ({
                  id: a.id,
                  dateTime: a.dateTime,
                  duration: a.duration,
                  status: a.status as DashScheduleAppointment["status"],
                  notes: a.notes,
                  patient: {
                    id: a.patient.id,
                    firstName: a.patient.firstName,
                    lastName: a.patient.lastName,
                  },
                  doctor: a.doctor
                    ? { id: a.doctor.id, name: a.doctor.name ?? "Unassigned" }
                    : undefined,
                }),
              ),
          );
        }
      } finally {
        setScheduleLoading(false);
      }
    }
    fetchSchedule();
  }, [branch.id]);

  let operatingHours: OperatingHoursMap = {};
  try {
    if (branch.operatingHours) operatingHours = JSON.parse(branch.operatingHours);
  } catch { /* ignore */ }

  // Sort members by patient count descending
  const topDoctors = [...branch.members]
    .sort((a, b) => (b.patientCount ?? 0) - (a.patientCount ?? 0))
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Left column */}
      <div className="space-y-6">
        {/* Today's Schedule */}
        <div
          className="rounded-[6px] border border-[#e5edf5] bg-white"
          style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
        >
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <h3 className="text-[16px] font-normal text-[#061b31]">{"Today's Schedule"}</h3>
          </div>
          {scheduleLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-[#e5edf5] animate-pulse" />)}
            </div>
          ) : (
            <ScheduleTable appointments={appointments} showDoctor showBranch={false} />
          )}
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-6">
        {/* Quick Info */}
        <div
          className="rounded-[6px] border border-[#e5edf5] bg-white"
          style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
        >
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <h3 className="text-[16px] font-normal text-[#061b31]">Quick Info</h3>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* Operating Hours */}
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748d] mb-2">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                Operating Hours
              </div>
              <div className="space-y-1">
                {DAY_ORDER.map((day) => {
                  const hours = operatingHours[day];
                  return (
                    <div key={day} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#273951]">{DAY_LABELS[day]}</span>
                      <span className={hours ? "text-[#273951]" : "text-[#c1c9d2]"}>
                        {hours ? `${hours.open} - ${hours.close}` : "Closed"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Details */}
            {branch.treatmentRooms && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#64748d]">Treatment Rooms</span>
                <span className="text-[#273951]">{branch.treatmentRooms}</span>
              </div>
            )}
            {branch.clinicType && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#64748d]">Clinic Type</span>
                <span className="text-[#273951] capitalize">{branch.clinicType}</span>
              </div>
            )}
            {branch.licenseNumber && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#64748d]">License</span>
                <span className="text-[#273951]">{branch.licenseNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Top Doctors */}
        <div
          className="rounded-[6px] border border-[#e5edf5] bg-white"
          style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
        >
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <h3 className="text-[16px] font-normal text-[#061b31]">Top Doctors</h3>
          </div>
          <div className="px-5 py-3">
            {topDoctors.length === 0 ? (
              <p className="text-[13px] text-[#64748d] py-3">No doctors in this branch.</p>
            ) : (
              <div className="space-y-3">
                {topDoctors.map((doc) => {
                  const initials = (doc.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2);
                  return (
                    <div key={doc.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[11px] font-medium">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[14px] text-[#061b31]">{doc.name ?? doc.email}</span>
                      </div>
                      <span className="text-[13px] text-[#64748d]">
                        {doc.patientCount ?? 0} patients
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
