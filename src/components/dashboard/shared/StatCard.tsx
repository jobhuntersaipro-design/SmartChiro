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
      className="rounded-[6px] border border-[#e5edf5] bg-white p-5 transition-all duration-200 ease-out hover:scale-[1.02] hover:border-[#c1c9d2]"
      style={{
        boxShadow:
          "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[6px]"
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
      <div className="text-[28px] font-light tracking-[-0.28px] text-[#061b31] leading-tight">
        {value}
      </div>
      <div className="mt-1 text-[15px] font-medium text-[#273951]">{label}</div>
      <div className="mt-0.5 text-[14px] text-[#64748d]">{subtitle}</div>
    </div>
  );
}
