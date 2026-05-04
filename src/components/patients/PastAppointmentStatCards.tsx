"use client";

import { CheckCircle2, XCircle, AlertTriangle, Clock, DollarSign } from "lucide-react";
import type { PastAppointmentStats } from "@/types/patient";

interface PastAppointmentStatCardsProps {
  stats: PastAppointmentStats;
  onShowStale?: () => void;
}

const SHADOW_CARD =
  "0 0 0 1px rgba(0,0,0,0.04), 0 1px 2px rgba(50,50,93,0.06), 0 1px 1px rgba(0,0,0,0.04)";

function StatCard({
  label,
  icon: Icon,
  iconColor,
  headline,
  headlineColor,
  subline,
  sublineColor,
  action,
}: {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconColor: string;
  headline: string;
  headlineColor: string;
  subline?: string;
  sublineColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4 transition-shadow duration-200"
      style={{ boxShadow: SHADOW_CARD }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className="h-4 w-4"
          style={{ color: iconColor }}
          strokeWidth={1.75}
        />
        <span className="text-[13px] font-medium text-[#64748d]">{label}</span>
      </div>
      <div
        className="text-[24px] font-semibold tabular-nums leading-none"
        style={{ color: headlineColor, fontFeatureSettings: '"tnum"' }}
      >
        {headline}
      </div>
      {subline && (
        <div
          className="mt-1.5 text-[12px] tabular-nums"
          style={{ color: sublineColor ?? "#64748d" }}
        >
          {subline}
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PastAppointmentStatCards({
  stats,
  onShowStale,
}: PastAppointmentStatCardsProps) {
  // Outstanding sub-line is hidden when there's nothing outstanding —
  // showing "RM 0 outstanding" adds noise. Same logic as Stripe's "Net volume" card.
  const outstandingLine =
    stats.outstanding > 0
      ? `RM ${stats.outstanding.toLocaleString()} outstanding`
      : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard
        label="Completed"
        icon={CheckCircle2}
        iconColor="#108c3d"
        headline={String(stats.completed)}
        headlineColor="#061b31"
        subline="appointments"
      />
      <StatCard
        label="Cancelled"
        icon={XCircle}
        iconColor="#94a3b8"
        headline={String(stats.cancelled)}
        headlineColor="#64748d"
        subline="appointments"
      />
      <StatCard
        label="No-show"
        icon={AlertTriangle}
        iconColor={stats.noShow > 0 ? "#ea2261" : "#94a3b8"}
        headline={String(stats.noShow)}
        headlineColor={stats.noShow > 0 ? "#ea2261" : "#64748d"}
        subline="appointments"
      />
      <StatCard
        label="Stale"
        icon={Clock}
        iconColor={stats.stale > 0 ? "#d99c45" : "#94a3b8"}
        headline={String(stats.stale)}
        headlineColor={stats.stale > 0 ? "#9b6829" : "#64748d"}
        subline={stats.stale > 0 ? "needs review" : "all clear"}
        sublineColor={stats.stale > 0 ? "#9b6829" : "#94a3b8"}
        action={
          stats.stale > 0 && onShowStale ? (
            <button
              type="button"
              onClick={onShowStale}
              className="text-[12px] font-medium text-[#9b6829] hover:text-[#7a4f1f] cursor-pointer transition-colors duration-200 underline-offset-2 hover:underline"
            >
              Show only stale
            </button>
          ) : undefined
        }
      />
      <StatCard
        label="Revenue"
        icon={DollarSign}
        iconColor="#108c3d"
        headline={`RM ${stats.paid.toLocaleString()}`}
        headlineColor="#108c3d"
        subline={outstandingLine}
        sublineColor="#64748d"
      />
    </div>
  );
}
