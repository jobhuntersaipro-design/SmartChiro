"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Users, TrendingUp, CalendarClock } from "lucide-react";

interface BranchStat {
  branchId: string;
  branchName: string;
  activePatients: number;
  newThisMonth: number;
  upcomingThisWeek: number;
}

interface BranchStatsResponse {
  role: string;
  scope: "all-branches" | "own-patients";
  branches: BranchStat[];
}

const SHADOW_CARD =
  "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)";

function StatRow({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="flex items-center gap-1.5 text-[#64748d]">
        {icon}
        {label}
      </span>
      <span className="font-medium" style={{ color: accent ?? "#061b31" }}>{value}</span>
    </div>
  );
}

function BranchCard({ stat, scope }: { stat: BranchStat; scope: "all-branches" | "own-patients" }) {
  return (
    <Link
      href={scope === "all-branches" ? `/dashboard/branches/${stat.branchId}` : "#"}
      onClick={(e) => { if (scope !== "all-branches") e.preventDefault(); }}
      className={`group relative block rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3.5 transition-all duration-200 ${
        scope === "all-branches" ? "hover:border-[#c1c9d2] hover:translate-y-[-1px] cursor-pointer" : "cursor-default"
      }`}
      style={{ boxShadow: SHADOW_CARD }}
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#64748d] truncate">{stat.branchName}</p>
          <p className="text-[28px] font-light leading-tight text-[#061b31] mt-0.5">{stat.activePatients}</p>
          <p className="text-[12px] text-[#64748d] -mt-0.5">active patients</p>
        </div>
        {scope === "all-branches" && (
          <ArrowUpRight
            className="h-4 w-4 text-[#64748d] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            strokeWidth={1.5}
          />
        )}
      </div>
      <div className="space-y-1.5 pt-2.5 border-t border-[#f0f3f7]">
        <StatRow
          icon={<TrendingUp className="h-3 w-3" strokeWidth={1.75} />}
          label="New this month"
          value={`+${stat.newThisMonth}`}
          accent={stat.newThisMonth > 0 ? "#30B130" : undefined}
        />
        <StatRow
          icon={<CalendarClock className="h-3 w-3" strokeWidth={1.75} />}
          label="Upcoming · 7d"
          value={stat.upcomingThisWeek}
          accent={stat.upcomingThisWeek > 0 ? "#533afd" : undefined}
        />
      </div>
    </Link>
  );
}

function PersonalCards({ stat }: { stat: BranchStat }) {
  // For DOCTOR users — same numbers but framed as "yours". Three pill-style mini cards in a row.
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      <div className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3.5" style={{ boxShadow: SHADOW_CARD }}>
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-3.5 w-3.5 text-[#533afd]" strokeWidth={1.75} />
          <span className="text-[13px] font-medium text-[#64748d]">My active patients</span>
        </div>
        <p className="text-[28px] font-light text-[#061b31] leading-tight">{stat.activePatients}</p>
        <p className="text-[12px] text-[#64748d]">in {stat.branchName}</p>
      </div>
      <div className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3.5" style={{ boxShadow: SHADOW_CARD }}>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-3.5 w-3.5 text-[#30B130]" strokeWidth={1.75} />
          <span className="text-[13px] font-medium text-[#64748d]">New this month</span>
        </div>
        <p className="text-[28px] font-light text-[#061b31] leading-tight">+{stat.newThisMonth}</p>
        <p className="text-[12px] text-[#64748d]">patients added</p>
      </div>
      <div className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3.5" style={{ boxShadow: SHADOW_CARD }}>
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="h-3.5 w-3.5 text-[#533afd]" strokeWidth={1.75} />
          <span className="text-[13px] font-medium text-[#64748d]">Upcoming · 7d</span>
        </div>
        <p className="text-[28px] font-light text-[#061b31] leading-tight">{stat.upcomingThisWeek}</p>
        <p className="text-[12px] text-[#64748d]">appointments</p>
      </div>
    </div>
  );
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3.5"
          style={{ boxShadow: SHADOW_CARD }}
        >
          <div className="h-3 w-20 bg-[#f0f3f7] rounded animate-pulse mb-2" />
          <div className="h-7 w-12 bg-[#f0f3f7] rounded animate-pulse mb-1" />
          <div className="h-3 w-24 bg-[#f0f3f7] rounded animate-pulse mb-3" />
          <div className="h-px w-full bg-[#f0f3f7] mb-2" />
          <div className="h-3 w-full bg-[#f0f3f7] rounded animate-pulse mb-1" />
          <div className="h-3 w-3/4 bg-[#f0f3f7] rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function BranchStatsCards() {
  const [data, setData] = useState<BranchStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/patients/branch-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonCards count={3} />;
  if (!data || data.branches.length === 0) return null;

  // DOCTOR with one branch → personal-style cards
  if (data.scope === "own-patients" && data.branches.length === 1) {
    return <PersonalCards stat={data.branches[0]} />;
  }

  // OWNER/ADMIN → one card per branch, wrap to multiple rows
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-5">
      {data.branches.map((b) => (
        <BranchCard key={b.branchId} stat={b} scope={data.scope} />
      ))}
    </div>
  );
}
