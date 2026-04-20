"use client";

interface RecoveryScoreBarProps {
  label: string;
  score: number; // 0-10
  inverted?: boolean; // true for pain (low score = good)
}

function getColor(effective: number): string {
  if (effective <= 3) return "#DF1B41";
  if (effective <= 6) return "#F5A623";
  return "#30B130";
}

export function RecoveryScoreBar({ label, score, inverted }: RecoveryScoreBarProps) {
  const clamped = Math.max(0, Math.min(10, score));
  const effective = inverted ? 10 - clamped : clamped;
  const color = getColor(effective);
  const widthPercent = (clamped / 10) * 100;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-medium text-[#273951]">{label}</span>
        <span className="text-[13px] font-medium" style={{ color }}>
          {clamped}/10
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 6, backgroundColor: "#e5edf5" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${widthPercent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
