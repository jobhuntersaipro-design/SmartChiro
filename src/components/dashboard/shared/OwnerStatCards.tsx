"use client";

import { Users, Calendar, Image, Stethoscope } from "lucide-react";
import { StatCard } from "./StatCard";
import type { OwnerStats } from "@/types/dashboard";
import { todayProgressLabel } from "@/lib/format";

interface OwnerStatCardsProps {
  stats: OwnerStats;
  branchLabel: string;
  /** X-ray counts are clinical — false for front desk. */
  showClinical?: boolean;
}

export function OwnerStatCards({ stats, branchLabel, showClinical = true }: OwnerStatCardsProps) {
  const xrayTrend =
    stats.xraysLastWeek > 0
      ? Math.round(((stats.xraysThisWeek - stats.xraysLastWeek) / stats.xraysLastWeek) * 100)
      : 0;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${showClinical ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      <StatCard
        icon={Users}
        iconColor="#533afd"
        iconBg="#ededfc"
        value={stats.totalPatients}
        label="Total Patients"
        subtitle={branchLabel}
      />
      <StatCard
        icon={Calendar}
        iconColor="#0570de"
        iconBg="#EFF6FF"
        value={stats.todayAppointments}
        label="Today's Appointments"
        subtitle={
          stats.todayAppointments > 0 && stats.remainingAppointments > 0
            ? `${stats.completedAppointments} completed, ${stats.remainingAppointments} remaining`
            : todayProgressLabel(stats.todayAppointments, stats.remainingAppointments)
        }
      />
      {showClinical && (
        <StatCard
          icon={Image}
          iconColor="#15be53"
          iconBg="#ECFDF5"
          value={stats.xraysThisWeek}
          label="X-Rays This Week"
          subtitle={
            xrayTrend >= 0
              ? `+${stats.xraysThisWeek - stats.xraysLastWeek} from last week`
              : `${stats.xraysThisWeek - stats.xraysLastWeek} from last week`
          }
          trend={xrayTrend !== 0 ? { value: Math.abs(xrayTrend), isPositive: xrayTrend > 0 } : undefined}
        />
      )}
      <StatCard
        icon={Stethoscope}
        iconColor="#64748d"
        iconBg="#F6F9FC"
        value={stats.activeDoctors}
        label="Active Doctors"
        subtitle={branchLabel}
      />
    </div>
  );
}
