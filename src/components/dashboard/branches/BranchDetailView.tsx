"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Building2, Phone, Mail, Globe, Pencil,
  Stethoscope, Users, CalendarDays, ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BranchDetail, BranchStats } from "@/types/branch";
import { BranchOverviewTab } from "./BranchOverviewTab";
import { BranchDoctorsTab } from "./BranchDoctorsTab";
import { BranchScheduleTab } from "./BranchScheduleTab";
import { BranchPatientsTab } from "./BranchPatientsTab";
import { BranchSettingsTab } from "./BranchSettingsTab";

interface BranchDetailViewProps {
  branchId: string;
  userId: string;
  userName: string | null;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "doctors", label: "Doctors" },
  { id: "schedule", label: "Schedule" },
  { id: "patients", label: "Patients" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function BranchDetailView({ branchId, userId, userName }: BranchDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "overview";

  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [stats, setStats] = useState<BranchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const isOwner = branch?.userRole === "OWNER";
  const isAdmin = branch?.userRole === "ADMIN";
  const canEdit = isOwner || isAdmin;

  const fetchBranch = useCallback(async () => {
    try {
      const res = await fetch(`/api/branches/${branchId}?include=stats`);
      if (res.ok) {
        const data = await res.json();
        setBranch(data.branch);
        setStats(data.stats);
      }
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchBranch();
  }, [fetchBranch]);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/dashboard/branches/${branchId}?tab=${tab}`, { scroll: false });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 rounded bg-[#e5edf5] animate-pulse" />
        <div className="h-32 rounded-[6px] bg-[#e5edf5] animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-[6px] bg-[#e5edf5] animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="py-12 text-center">
        <Building2 className="h-12 w-12 mx-auto text-[#e5edf5] mb-3" strokeWidth={1} />
        <p className="text-[15px] text-[#64748d]">Branch not found or you don&apos;t have access.</p>
        <Link href="/dashboard/branches" className="text-[14px] text-[#533afd] hover:underline mt-2 inline-block">
          Back to Branches
        </Link>
      </div>
    );
  }

  const visibleTabs = canEdit ? TABS : TABS.filter((t) => t.id !== "settings");

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/branches"
        className="inline-flex items-center gap-1.5 text-[14px] text-[#64748d] hover:text-[#061b31] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
        Back to Branches
      </Link>

      {/* Header card */}
      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white px-6 py-5"
        style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-[23px] font-normal text-[#061b31]">{branch.name}</h1>
            {(branch.address || branch.city) && (
              <p className="text-[14px] text-[#64748d] mt-0.5">
                {[branch.address, branch.city, branch.state, branch.zip].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTabChange("settings")}
              className="rounded-[4px] border-[#e5edf5] text-[14px] text-[#273951] cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
              Edit
            </Button>
          )}
        </div>

        {/* Contact info */}
        <div className="flex items-center gap-5 text-[13px] text-[#64748d]">
          {branch.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
              {branch.phone}
            </span>
          )}
          {branch.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
              {branch.email}
            </span>
          )}
          {branch.website && (
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" strokeWidth={1.5} />
              {branch.website}
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Doctors", value: stats.doctorCount, icon: Stethoscope, color: "#533afd" },
            { label: "Patients", value: stats.patientCount, icon: Users, color: "#0570DE" },
            { label: "Today's Appts", value: stats.todayAppointments, icon: CalendarDays, color: "#30B130" },
            { label: "X-Rays (Month)", value: stats.xraysThisMonth, icon: ImageIcon, color: "#F5A623" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3"
              style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
            >
              <div className="flex items-center gap-2.5">
                <s.icon className="h-4 w-4" style={{ color: s.color }} strokeWidth={1.5} />
                <div>
                  <p className="text-[12px] text-[#64748d]">{s.label}</p>
                  <p className="text-[20px] font-normal text-[#061b31] leading-tight">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[#e5edf5]">
        <nav className="flex gap-0 -mb-px">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-[#533afd] text-[#533afd]"
                  : "border-transparent text-[#64748d] hover:text-[#061b31] hover:border-[#c1c9d2]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <BranchOverviewTab branch={branch} stats={stats} />
      )}
      {activeTab === "doctors" && (
        <BranchDoctorsTab
          branchId={branchId}
          members={branch.members}
          userRole={branch.userRole}
          onRefresh={fetchBranch}
        />
      )}
      {activeTab === "schedule" && (
        <BranchScheduleTab branchId={branchId} operatingHours={branch.operatingHours} />
      )}
      {activeTab === "patients" && (
        <BranchPatientsTab branchId={branchId} members={branch.members} />
      )}
      {activeTab === "settings" && canEdit && (
        <BranchSettingsTab
          branch={branch}
          isOwner={isOwner}
          onSave={fetchBranch}
        />
      )}
    </div>
  );
}
