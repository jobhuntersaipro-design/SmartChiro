"use client";

import {
  RECOVERY_METRICS,
  clampScore,
  directionHint,
  scoreColor,
  type RecoveryMetric,
} from "@/lib/recovery-scores";

interface RecoveryScoreBarProps {
  metric: RecoveryMetric;
  score: number; // 0-10
}

/** One questionnaire score, coloured by whether a low or high number is good news. */
export function RecoveryScoreBar({ metric, score }: RecoveryScoreBarProps) {
  const { label, direction } = RECOVERY_METRICS[metric];
  const clamped = clampScore(score);
  const color = scoreColor(clamped, direction);
  const widthPercent = (clamped / 10) * 100;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[#273951] truncate">{label}</span>
        <span className="text-[13px] font-medium whitespace-nowrap" style={{ color }}>
          {clamped}/10
        </span>
      </div>
      <p className="text-[11px] text-[#64748d] mb-1 truncate">{directionHint(direction)}</p>
      <div className="w-full h-1.5 rounded-full overflow-hidden bg-[#e5edf5]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${widthPercent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
