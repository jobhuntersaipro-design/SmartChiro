"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Users, TrendingUp, CalendarClock } from "lucide-react";

interface BranchStat {
  branchId: string;
  branchName: string;
  totalPatients: number;
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
  "var(--shadow-card)";

function StatRow({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="flex items-center gap-1.5 text-fg-secondary">
        {icon}
        {label}
      </span>
      <span className="font-medium" style={{ color: accent ?? "#0b0b0b" }}>{value}</span>
    </div>
  );
}

function BranchCard({ stat, scope }: { stat: BranchStat; scope: "all-branches" | "own-patients" }) {
  return (
    <Link
      href={scope === "all-branches" ? `/dashboard/branches/${stat.branchId}` : "#"}
      onClick={(e) => { if (scope !== "all-branches") e.preventDefault(); }}
      className={`group relative block rounded-panel border border-border bg-white px-4 py-3.5 transition-all duration-200 ${
        scope === "all-branches" ? "hover:border-border-strong hover:translate-y-[-1px] cursor-pointer" : "cursor-default"
      }`}
      style={{ boxShadow: SHADOW_CARD }}
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg-secondary truncate">{stat.branchName}</p>
          <p className="text-[28px] font-medium leading-tight text-foreground mt-0.5">{stat.totalPatients}</p>
          <p className="text-[12px] text-fg-secondary -mt-0.5">patients</p>
        </div>
        {scope === "all-branches" && (
          <ArrowUpRight
            className="h-4 w-4 text-fg-secondary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            strokeWidth={1.5}
          />
        )}
      </div>
      <div className="space-y-1.5 pt-2.5 border-t border-border-subtle">
        <StatRow
          icon={<Users className="h-3 w-3" strokeWidth={1.75} />}
          label="Active"
          value={stat.activePatients}
        />
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
          accent={stat.upcomingThisWeek > 0 ? "#7747ff" : undefined}
        />
      </div>
    </Link>
  );
}

function PersonalCards({ stat }: { stat: BranchStat }) {
  // For DOCTOR users — same numbers but framed as "yours". Three pill-style mini cards in a row.
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      <div className="rounded-panel border border-border bg-white px-4 py-3.5" style={{ boxShadow: SHADOW_CARD }}>
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-3.5 w-3.5 text-brand" strokeWidth={1.75} />
          <span className="text-[13px] font-medium text-fg-secondary">My active patients</span>
        </div>
        <p className="text-[28px] font-medium text-foreground leading-tight">{stat.activePatients}</p>
        <p className="text-[12px] text-fg-secondary">in {stat.branchName}</p>
      </div>
      <div className="rounded-panel border border-border bg-white px-4 py-3.5" style={{ boxShadow: SHADOW_CARD }}>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
          <span className="text-[13px] font-medium text-fg-secondary">New this month</span>
        </div>
        <p className="text-[28px] font-medium text-foreground leading-tight">+{stat.newThisMonth}</p>
        <p className="text-[12px] text-fg-secondary">patients added</p>
      </div>
      <div className="rounded-panel border border-border bg-white px-4 py-3.5" style={{ boxShadow: SHADOW_CARD }}>
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="h-3.5 w-3.5 text-brand" strokeWidth={1.75} />
          <span className="text-[13px] font-medium text-fg-secondary">Upcoming · 7d</span>
        </div>
        <p className="text-[28px] font-medium text-foreground leading-tight">{stat.upcomingThisWeek}</p>
        <p className="text-[12px] text-fg-secondary">appointments</p>
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
          className="rounded-panel border border-border bg-white px-4 py-3.5"
          style={{ boxShadow: SHADOW_CARD }}
        >
          <div className="h-3 w-20 bg-surface-hover rounded animate-pulse mb-2" />
          <div className="h-7 w-12 bg-surface-hover rounded animate-pulse mb-1" />
          <div className="h-3 w-24 bg-surface-hover rounded animate-pulse mb-3" />
          <div className="h-px w-full bg-surface-hover mb-2" />
          <div className="h-3 w-full bg-surface-hover rounded animate-pulse mb-1" />
          <div className="h-3 w-3/4 bg-surface-hover rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** `scopeKey` changes when the sidebar branch switcher changes scope; refetch then. */
export function BranchStatsCards({ scopeKey }: { scopeKey?: string } = {}) {
  const [data, setData] = useState<BranchStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/patients/branch-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .finally(() => setLoading(false));
  }, [scopeKey]);

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
