"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  value: number | string;
  label: string;
  subtitle: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatCard({
  icon: Icon,
  iconColor,
  iconBg,
  value,
  label,
  subtitle,
  trend,
}: StatCardProps) {
  return (
    <div
      className="rounded-panel border border-border bg-white p-5 transition-all duration-200 ease-out hover:scale-[1.02] hover:border-border-strong"
      style={{
        boxShadow:
          "var(--shadow-lg)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-panel"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} strokeWidth={1.5} />
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 text-[14px] font-medium"
            style={{ color: trend.isPositive ? "#15be53" : "#df1b41" }}
          >
            {trend.isPositive ? (
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {trend.isPositive ? "+" : ""}
            {trend.value}%
          </div>
        )}
      </div>
      <div className="text-[28px] font-medium tracking-[-0.28px] text-foreground leading-tight">
        {value}
      </div>
      <div className="mt-1 text-[15px] font-medium text-foreground">{label}</div>
      <div className="mt-0.5 text-[14px] text-fg-secondary">{subtitle}</div>
    </div>
  );
}
