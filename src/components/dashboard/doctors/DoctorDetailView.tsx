"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Stethoscope, Users, CalendarCheck, ImageIcon, TrendingUp,
  Mail, Phone, Settings,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { DoctorDetail } from "@/types/doctor";
import { DoctorOverviewTab } from "./DoctorOverviewTab";
import { DoctorPatientsTab } from "./DoctorPatientsTab";
import { DoctorScheduleTab } from "./DoctorScheduleTab";
import { DoctorProfessionalTab } from "./DoctorProfessionalTab";
import { DoctorAvailabilityTab } from "./DoctorAvailabilityTab";

interface DoctorDetailViewProps {
  doctorId: string;
  currentUserId: string;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "patients", label: "Patients" },
  { id: "schedule", label: "Schedule" },
  { id: "availability", label: "Availability" },
  { id: "professional", label: "Professional" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function DoctorDetailView({ doctorId, currentUserId }: DoctorDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "overview";

  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const isSelf = doctorId === currentUserId;

  const fetchDoctor = useCallback(async () => {
    try {
      const res = await fetch(`/api/doctors/${doctorId}?include=detail`);
      if (res.ok) {
        const data = await res.json();
        setDoctor(data.doctor ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    fetchDoctor();
  }, [fetchDoctor]);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/dashboard/doctors/${doctorId}?tab=${tab}`, { scroll: false });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-28 rounded bg-[#e5edf5] animate-pulse" />
        <div className="h-32 rounded-[6px] bg-[#e5edf5] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-[6px] bg-[#e5edf5] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="py-12 text-center">
        <Stethoscope className="h-12 w-12 mx-auto text-[#e5edf5] mb-3" strokeWidth={1} />
        <p className="text-[15px] text-[#64748d]">Doctor not found or you don&apos;t have access.</p>
        <Link href="/dashboard/doctors" className="text-[14px] text-[#533afd] hover:underline mt-2 inline-block">
          Back to Doctors
        </Link>
      </div>
    );
  }

  const initials = getInitials(doctor.name, doctor.email);
  const specialties = doctor.profile?.specialties ?? [];

  const statCards = [
    { label: "Patients", value: doctor.stats.patientCount, icon: Users, color: "#533afd" },
    { label: "Visits (Month)", value: doctor.stats.visitsThisMonth ?? 0, icon: CalendarCheck, color: "#0570DE" },
    { label: "X-Rays", value: doctor.stats.totalXrays, icon: ImageIcon, color: "#30B130" },
    { label: "Avg Visits/Pt", value: doctor.stats.avgVisitsPerPatient ?? 0, icon: TrendingUp, color: "#F5A623" },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/doctors"
        className="inline-flex items-center gap-1.5 text-[14px] text-[#64748d] hover:text-[#061b31] transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Back to Doctors
      </Link>

      {/* Header card */}
      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white px-6 py-5"
        style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 shrink-0">
              {doctor.image && (
                <AvatarImage src={doctor.image} alt={doctor.name ?? "Doctor"} />
              )}
              <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[16px] font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[23px] font-light text-[#061b31]">
                  {doctor.name ?? "Unnamed"}
                </h1>
                <span
                  className={`rounded-[4px] px-[8px] py-[2px] text-[11px] font-light ${
                    doctor.profile?.isActive !== false
                      ? "bg-[rgba(21,190,83,0.2)] text-[#108c3d] border border-[rgba(21,190,83,0.4)]"
                      : "bg-[#F0F3F7] text-[#64748d]"
                  }`}
                >
                  {doctor.profile?.isActive !== false ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-[14px] text-[#64748d]">
                {doctor.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {doctor.email}
                  </span>
                )}
                {doctor.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {doctor.phone}
                  </span>
                )}
              </div>
              {specialties.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {specialties.map((s) => (
                    <span key={s} className="text-[12px] text-[#533afd] bg-[#ededfc] rounded-full px-2.5 py-0.5">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSelf && (
              <Link href={`/dashboard/settings/${doctorId}`}>
                <Button
                  variant="outline"
                  className="h-9 rounded-[4px] text-[14px] border-[#e5edf5] gap-1.5"
                >
                  <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Settings
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-4 w-4" style={{ color: s.color }} strokeWidth={1.5} />
              <span className="text-[13px] text-[#64748d]">{s.label}</span>
            </div>
            <div
              className="text-[22px] font-light text-[#061b31]"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-[#e5edf5]">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#533afd] text-[#533afd]"
                  : "border-transparent text-[#64748d] hover:text-[#061b31]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <DoctorOverviewTab doctorId={doctorId} doctor={doctor} />
      )}
      {activeTab === "patients" && (
        <DoctorPatientsTab doctorId={doctorId} />
      )}
      {activeTab === "schedule" && (
        <DoctorScheduleTab doctor={doctor} />
      )}
      {activeTab === "availability" && (
        <DoctorAvailabilityTab doctorId={doctorId} doctor={doctor} currentUserId={currentUserId} />
      )}
      {activeTab === "professional" && (
        <DoctorProfessionalTab doctor={doctor} />
      )}
    </div>
  );
}
