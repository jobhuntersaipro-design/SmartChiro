"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BranchRole } from "@prisma/client";
import type {
  BranchSummary,
  OwnerStats,
  DoctorStats,
  RecentPatient,
  RecentXray,
} from "@/types/dashboard";
import type { ScheduleAppointment } from "./shared/ScheduleTable";
import type { ActivityItem } from "./shared/ActivityFeed";

import { GreetingBar } from "./GreetingBar";
import { OwnerStatCards } from "./shared/OwnerStatCards";
import { DoctorStatCards } from "./shared/DoctorStatCards";
import { ScheduleTable } from "./shared/ScheduleTable";
import { ActivityFeed } from "./shared/ActivityFeed";
import { OnboardingPrompt } from "./shared/OnboardingPrompt";
import { SkeletonStatCards } from "./shared/SkeletonCard";
import { SkeletonTable } from "./shared/SkeletonTable";

import { QuickActionsPanel } from "./owner/QuickActionsPanel";

import { RecentPatientsCard } from "./doctor/RecentPatientsCard";
import { RecentXraysGrid } from "./doctor/RecentXraysGrid";

interface DashboardViewProps {
  userId: string;
  userName: string | null;
  branchRole: BranchRole | null;
  activeBranchId: string | null;
}

export function DashboardView({
  userId,
  userName,
  branchRole,
  activeBranchId,
}: DashboardViewProps) {
  const isDoctor = branchRole === "DOCTOR";
  const isOwner = branchRole === "OWNER";

  const router = useRouter();
  const searchParams = useSearchParams();

  // Branch filter state — synced with URL ?branch=xxx
  const selectedBranchId = searchParams.get("branch") || null;

  const setSelectedBranchId = useCallback((branchId: string | null) => {
    if (branchId) {
      router.push(`/dashboard?branch=${branchId}`, { scroll: false });
    } else {
      router.push("/dashboard", { scroll: false });
    }
  }, [router]);

  // Data states
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [ownerStats, setOwnerStats] = useState<OwnerStats | null>(null);
  const [doctorStats, setDoctorStats] = useState<DoctorStats | null>(null);
  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [recentPatients, setRecentPatients] = useState<RecentPatient[]>([]);
  const [recentXrays, setRecentXrays] = useState<RecentXray[]>([]);

  // Loading
  const [statsLoading, setStatsLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [hasBranch, setHasBranch] = useState<boolean | null>(null);

  const branchParam = selectedBranchId ?? "all";

  // Fetch branches
  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/branches");
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches);
        setHasBranch(data.branches.length > 0);
      }
    } catch {
      setHasBranch(false);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/stats?branchId=${branchParam}`);
      if (res.ok) {
        const data = await res.json();
        if (isDoctor) {
          setDoctorStats(data);
        } else {
          setOwnerStats(data);
        }
      }
    } finally {
      setStatsLoading(false);
    }
  }, [branchParam, isDoctor]);

  // Fetch schedule
  const fetchSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const res = await fetch(`/api/dashboard/schedule?branchId=${branchParam}`);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data.appointments);
      }
    } finally {
      setScheduleLoading(false);
    }
  }, [branchParam]);

  // Fetch activity
  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/activity?branchId=${branchParam}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities);
      }
    } catch {
      // ignore
    }
  }, [branchParam]);

  // Fetch doctor-specific data
  const fetchDoctorData = useCallback(async () => {
    if (!isDoctor) return;
    try {
      const [patientsRes, xraysRes] = await Promise.all([
        fetch("/api/dashboard/recent-patients"),
        fetch("/api/dashboard/recent-xrays"),
      ]);
      if (patientsRes.ok) {
        const data = await patientsRes.json();
        setRecentPatients(data.patients);
      }
      if (xraysRes.ok) {
        const data = await xraysRes.json();
        setRecentXrays(data.xrays);
      }
    } catch {
      // ignore
    }
  }, [isDoctor]);

  // Initial load
  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    if (hasBranch === null) return;
    if (!hasBranch) return;
    fetchStats();
    fetchSchedule();
    fetchActivity();
    fetchDoctorData();
  }, [hasBranch, fetchStats, fetchSchedule, fetchActivity, fetchDoctorData]);

  // No branch — onboarding (redirect to branches page)
  if (hasBranch === false) {
    return (
      <OnboardingPrompt onCreateBranch={() => router.push("/dashboard/branches")} />
    );
  }

  // Loading initial state
  if (hasBranch === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded bg-[#e5edf5] animate-pulse" />
        <SkeletonStatCards />
        <SkeletonTable rows={5} />
      </div>
    );
  }

  const branchList = branches.map((b) => ({ id: b.id, name: b.name }));
  const selectedBranchName =
    branches.find((b) => b.id === selectedBranchId)?.name ?? null;
  const branchLabel = selectedBranchName
    ? `in ${selectedBranchName}`
    : `across ${branches.length} branch${branches.length !== 1 ? "es" : ""}`;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <GreetingBar
        userName={userName}
        branchRole={branchRole}
        branches={branchList}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
      />

      {/* Stat Cards */}
      {statsLoading ? (
        <SkeletonStatCards />
      ) : isDoctor && doctorStats ? (
        <DoctorStatCards
          stats={doctorStats}
          branchName={branchList[0]?.name ?? "Branch"}
        />
      ) : ownerStats ? (
        <OwnerStatCards stats={ownerStats} branchLabel={branchLabel} />
      ) : null}

      {/* Owner: Quick Actions */}
      {isOwner && (
        <QuickActionsPanel
          branchRole={branchRole}
          onCreateBranch={() => router.push("/dashboard/branches")}
          onAddDoctor={() => router.push("/dashboard/branches")}
        />
      )}

      {/* Schedule + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div
          className="rounded-[6px] border border-[#e5edf5] bg-white"
          style={{
            boxShadow:
              "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
          }}
        >
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <h3 className="text-[16px] font-normal text-[#061b31]">
              {isDoctor ? "My Schedule Today" : "Today's Schedule"}
            </h3>
          </div>
          {scheduleLoading ? (
            <SkeletonTable rows={5} />
          ) : (
            <ScheduleTable
              appointments={appointments}
              showDoctor={!isDoctor}
              showBranch={!isDoctor && !selectedBranchId}
            />
          )}
        </div>

        <div
          className="rounded-[6px] border border-[#e5edf5] bg-white"
          style={{
            boxShadow:
              "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
          }}
        >
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <h3 className="text-[16px] font-normal text-[#061b31]">
              {isDoctor ? "Recent Patients" : "Recent Activity"}
            </h3>
          </div>
          {isDoctor ? (
            <RecentPatientsCard patients={recentPatients} />
          ) : (
            <ActivityFeed
              activities={activities}
              showBranch={!selectedBranchId}
            />
          )}
        </div>
      </div>

      {/* Doctor: Recent X-Rays */}
      {isDoctor && (
        <div
          className="rounded-[6px] border border-[#e5edf5] bg-white"
          style={{
            boxShadow:
              "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
          }}
        >
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <h3 className="text-[16px] font-normal text-[#061b31]">
              Recent X-Rays
            </h3>
          </div>
          <div className="py-4">
            <RecentXraysGrid xrays={recentXrays} />
          </div>
        </div>
      )}
    </div>
  );
}
