"use client";

import { useEffect, useState, useMemo } from "react";
import { TrendingUp } from "lucide-react";

interface Props {
  branchId: string | null;
}

interface SeriesPoint {
  date: string;
  amount: number;
}

export function RevenueCard({ branchId }: Props) {
  const [data, setData] = useState<{ series: SeriesPoint[]; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("days", "30");
    if (branchId) params.set("branchId", branchId);
    fetch(`/api/dashboard/revenue?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { series: [], total: 0 }))
      .then((d) => {
        if (cancelled) return;
        setData({ series: d.series ?? [], total: d.total ?? 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const loading = data === null;
  const series = data?.series ?? [];
  const total = data?.total ?? 0;

  const max = useMemo(() => Math.max(1, ...series.map((s) => s.amount)), [series]);
  const W = 600;
  const H = 120;
  const padX = 4;

  const path = useMemo(() => {
    if (series.length === 0) return "";
    const stepX = (W - padX * 2) / Math.max(1, series.length - 1);
    return series
      .map((p, i) => {
        const x = padX + i * stepX;
        const y = H - 8 - (p.amount / max) * (H - 16);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [series, max]);

  const areaPath = useMemo(() => {
    if (!path) return "";
    const stepX = (W - padX * 2) / Math.max(1, series.length - 1);
    const lastX = padX + (series.length - 1) * stepX;
    return `${path} L ${lastX.toFixed(2)} ${H - 8} L ${padX} ${H - 8} Z`;
  }, [path, series.length]);

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white"
      style={{
        boxShadow:
          "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
      }}
    >
      <div className="px-5 py-4 border-b border-[#e5edf5] flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-normal text-[#061b31]">
            <TrendingUp className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
            Revenue (Last 30 Days)
          </h3>
          <p className="mt-0.5 text-[12px] text-[#64748d]">Paid invoices, in MYR</p>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-light text-[#061b31] tabular-nums">
            RM {total.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#64748d]">total this period</div>
        </div>
      </div>
      <div className="px-3 py-3 h-[140px]">
        {loading ? (
          <div className="h-full bg-[#f6f9fc] rounded animate-pulse" />
        ) : series.length === 0 || total === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-[#64748d]">
            No paid invoices in the last 30 days yet.
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#533afd" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#533afd" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#revenue-fill)" />
            <path d={path} fill="none" stroke="#533afd" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
      </div>
      {!loading && series.length > 0 && (
        <div className="px-5 pb-3 flex items-center justify-between text-[11px] text-[#64748d]">
          <span>{series[0].date}</span>
          <span>{series[series.length - 1].date}</span>
        </div>
      )}
    </div>
  );
}
