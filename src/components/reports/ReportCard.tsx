"use client";

import type { ReactNode } from "react";
import { AlertCircle, Download, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Saves CSV text as a file (with a BOM so Excel reads UTF-8 names correctly). */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ReportCardProps {
  title: string;
  description: string;
  /** First load: no data yet. */
  loading: boolean;
  /** A newer range is loading while older data is still shown. */
  refreshing: boolean;
  error: string | null;
  onRetry: () => void;
  /** Builds the CSV for the table currently shown; absent until data is loaded. */
  onExport?: () => void;
  exportLabel?: string;
  className?: string;
  children?: ReactNode;
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 animate-pulse rounded-[4px] bg-[#f0f3f7]" />
        <div className="h-16 animate-pulse rounded-[4px] bg-[#f0f3f7]" />
      </div>
      <div className="h-40 animate-pulse rounded-[4px] bg-[#f0f3f7]" />
    </div>
  );
}

export function ReportCard({
  title,
  description,
  loading,
  refreshing,
  error,
  onRetry,
  onExport,
  exportLabel = "Export CSV",
  className,
  children,
}: ReportCardProps) {
  return (
    <section
      aria-labelledby={`report-${title}`}
      aria-busy={loading || refreshing}
      className={cn("min-w-0 rounded-[6px] border border-[#e5edf5] bg-white p-4 shadow-(--shadow-card) sm:p-5", className)}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`report-${title}`} className="text-[18px] font-normal text-[#061b31]">
            {title}
          </h2>
          <p className="mt-0.5 text-[14px] text-[#64748d]">{description}</p>
        </div>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] border border-[#e5edf5] bg-white px-2.5 text-[14px] text-[#273951] transition-colors hover:bg-[#f6f9fc] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#635BFF]"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            {exportLabel}
          </button>
        )}
      </header>
      {error && !refreshing ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[4px] bg-[#fdecef] px-3 py-2.5 text-[14px] text-[#b41a36]">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-medium hover:underline">
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Try again
          </button>
        </div>
      ) : loading ? (
        <Skeleton />
      ) : (
        <div className={cn("space-y-4 transition-opacity", refreshing && "opacity-60")}>{children}</div>
      )}
    </section>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

/** A headline number (proportional figures — tabular only in columns). */
export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-[4px] bg-[#f6f9fc] px-3 py-2.5">
      <p className="text-[13px] text-[#64748d]">{label}</p>
      <p className="mt-0.5 truncate text-[23px] font-light whitespace-nowrap text-[#061b31]" title={value}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[13px] text-[#64748d]">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}

/** Small tab switch inside a card (which breakdown the table / CSV show). */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-[4px] bg-[#f6f9fc] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-7 rounded-[4px] px-2.5 text-[14px] whitespace-nowrap transition-colors",
            value === o.id ? "bg-white text-[#533afd] shadow-(--shadow-xs)" : "text-[#425466] hover:text-[#061b31]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
