"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

interface AnalysisProgressCardProps {
  label: string;
  /** 0-100 reached so far. */
  percent: number;
  /** 0-100 the next step reaches; the bar creeps toward it while waiting. */
  ceiling: number;
  onCancel: () => void;
}

/** Floating progress for the AI pelvis analysis (about 30 s): real stages from the server, eased in between. */
export function AnalysisProgressCard({ label, percent, ceiling, onCancel }: AnalysisProgressCardProps) {
  const [shown, setShown] = useState(percent);

  useEffect(() => {
    // Never go back; creep toward (but not onto) the next step while a model call runs.
    const tick = () => setShown((s) => Math.max(percent, s + Math.max(0, ceiling - 0.5 - s) * 0.06));
    tick();
    const id = window.setInterval(tick, 300);
    return () => window.clearInterval(id);
  }, [percent, ceiling]);

  const value = Math.round(Math.min(99, shown));
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute left-1/2 top-4 z-30 w-[min(360px,calc(100%-2rem))] -translate-x-1/2 rounded-panel border border-white/10 bg-canvas-raised/95 p-3 text-white shadow-(--shadow-floating) backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">AI pelvis analysis</span>
        <span className="text-[12px] tabular-nums text-white/70">{value}%</span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Cancel AI analysis"
          title="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="AI analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-standard" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-white/60">{label}… about 30 seconds in total.</p>
    </div>
  );
}
