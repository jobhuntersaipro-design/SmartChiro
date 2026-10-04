"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BranchRole } from "@prisma/client";
import { can } from "@/lib/permissions";
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
import { OwnerSignalsCard } from "./owner/OwnerSignalsCard";
import { CertificateAlertsCard } from "@/components/certificates/CertificateAlertsCard";
import { CreateAppointmentDialog } from "@/components/patients/CreateAppointmentDialog";

import { RecentPatientsCard } from "./doctor/RecentPatientsCard";
import { RecentXraysGrid } from "./doctor/RecentXraysGrid";

interface DashboardViewProps {
  userId: string;
  userName: string | null;
  branchRole: BranchRole | null;
  /** The caller's role in each of their branches. */
  roles: Record<string, BranchRole>;
  activeBranchId: string | null;
  /** "All branches" is on in the sidebar switcher. */
  allBranches?: boolean;
}

export function DashboardView({
  userId,
  userName,
  branchRole: scopeBranchRole,
  roles,
  activeBranchId,
  allBranches = false,
}: DashboardViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [signalsKey, setSignalsKey] = useState(0);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Branch filter state — synced with URL ?branch=xxx (`all` = every branch).
  // Without one it follows the sidebar branch switcher.
  const branchUrlParam = searchParams.get("branch");
  const selectedBranchId =
    branchUrlParam === "all" ? null : branchUrlParam || (allBranches ? null : activeBranchId);

  // The view follows the role in the branch picked here (the stats API
  // answers with the doctor view for a branch where the user is a doctor).
  const branchRole = (selectedBranchId && roles[selectedBranchId]) || scopeBranchRole;
  const isDoctor = branchRole === "DOCTOR";
  const isOwner = branchRole === "OWNER";
  // Front desk gets the owner layout (today's schedule with check-in actions,
  // patient / appointment counts) minus clinical stats.
  const showClinicalStats = can(branchRole, "dashboard.clinicalStats");
  // Revenue signals, quick actions: OWNER/ADMIN. Booking: anyone who manages
  // appointments (front desk included).
  const canManage = isOwner || branchRole === "ADMIN";
  const canBook = can(branchRole, "appointment.manageAll");

  const setSelectedBranchId = useCallback((branchId: string | null) => {
    router.push(`/dashboard?branch=${branchId ?? "all"}`, { scroll: false });
  }, [router]);

  // Data states
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [ownerStats, setOwnerStats] = useState<OwnerStats | null>(null);
  const [doctorStats, setDoctorStats] = useState<DoctorStats | null>(null);
  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [scheduleTotal, setScheduleTotal] = useState(0);
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
        setScheduleTotal(data.total ?? data.appointments.length);
      }
    } finally {
      setScheduleLoading(false);
    }
  }, [branchParam]);

  // Quiet refresh after a check-in / no-show from the table (no skeleton flash).
  const refreshSchedule = useCallback(async () => {
    setSignalsKey((k) => k + 1);
    const res = await fetch(`/api/dashboard/schedule?branchId=${branchParam}`);
    if (res.ok) {
      const data = await res.json();
      setAppointments(data.appointments);
      setScheduleTotal(data.total ?? data.appointments.length);
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
        <div className="h-8 w-64 rounded bg-border animate-pulse" />
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
        onNewAppointment={canBook ? () => setCreateOpen(true) : undefined}
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
        <OwnerStatCards stats={ownerStats} branchLabel={branchLabel} showClinical={showClinicalStats} />
      ) : null}

      {/* Owner / front desk: what needs attention today */}
      {canManage && <OwnerSignalsCard branchParam={branchParam} refreshKey={signalsKey} />}

      {/* Owner / admin: practising certificates expired or due within 60 days */}
      {canManage && <CertificateAlertsCard branchParam={branchParam} />}

      {/* Owner / front desk: Quick Actions */}
      {canManage && (
        <QuickActionsPanel
          branchRole={branchRole}
          onCreateBranch={() => router.push("/dashboard/branches")}
          onAddDoctor={() => router.push("/dashboard/doctors")}
        />
      )}

      {/* Schedule + Activity */}
      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_320px] gap-6 [&>*]:min-w-0">
        <div
          className="rounded-panel border border-border bg-white"
          style={{
            boxShadow:
              "var(--shadow-card)",
          }}
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[16px] font-normal text-foreground">
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
              onStatusChanged={refreshSchedule}
              total={scheduleTotal}
              branchParam={branchParam}
            />
          )}
        </div>

        <div
          className="rounded-panel border border-border bg-white"
          style={{
            boxShadow:
              "var(--shadow-card)",
          }}
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[16px] font-normal text-foreground">
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
          className="rounded-panel border border-border bg-white"
          style={{
            boxShadow:
              "var(--shadow-card)",
          }}
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[16px] font-normal text-foreground">
              Recent X-Rays
            </h3>
          </div>
          <div className="py-4">
            <RecentXraysGrid xrays={recentXrays} />
          </div>
        </div>
      )}

      {canBook && (
        <CreateAppointmentDialog
          open={createOpen}
          isAdmin
          currentUserId={userId}
          prefilledPatient={null}
          prefilledDoctor={null}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refreshSchedule();
            void fetchStats();
          }}
        />
      )}
    </div>
  );
}
