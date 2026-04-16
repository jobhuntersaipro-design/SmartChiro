"use client";

import { Users, Calendar, Image, PenTool } from "lucide-react";
import { StatCard } from "./StatCard";
import type { DoctorStats } from "@/types/dashboard";

interface DoctorStatCardsProps {
  stats: DoctorStats;
  branchName: string;
}

export function DoctorStatCards({ stats, branchName }: DoctorStatCardsProps) {
  const xrayTrend =
    stats.xraysLastMonth > 0
      ? Math.round(((stats.xraysThisMonth - stats.xraysLastMonth) / stats.xraysLastMonth) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        icon={Users}
        iconColor="#533afd"
        iconBg="#ededfc"
        value={stats.myPatients}
        label="My Patients"
        subtitle={`in ${branchName}`}
      />
      <StatCard
        icon={Calendar}
        iconColor="#0570de"
        iconBg="#EFF6FF"
        value={stats.todayAppointments}
        label="Today's Appointments"
        subtitle={`${stats.remainingAppointments} remaining`}
      />
      <StatCard
        icon={Image}
        iconColor="#15be53"
        iconBg="#ECFDF5"
        value={stats.xraysThisMonth}
        label="X-Rays This Month"
        subtitle={
          xrayTrend >= 0
            ? `+${stats.xraysThisMonth - stats.xraysLastMonth} from last month`
            : `${stats.xraysThisMonth - stats.xraysLastMonth} from last month`
        }
        trend={xrayTrend !== 0 ? { value: Math.abs(xrayTrend), isPositive: xrayTrend > 0 } : undefined}
      />
      <StatCard
        icon={PenTool}
        iconColor="#f5a623"
        iconBg="#FFF8E1"
        value={stats.pendingAnnotations}
        label="Pending Annotations"
        subtitle="need review"
      />
    </div>
  );
}
