"use client";

const SHADOW_CARD =
  "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)";

export function PatientTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden"
      style={{ boxShadow: SHADOW_CARD }}
    >
      <div className="grid grid-cols-[1fr_180px_140px_130px_90px_80px_40px] gap-3 px-4 py-2.5 border-b border-[#e5edf5] bg-[#f6f9fc]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3 w-16 bg-[#e5edf5] rounded animate-pulse" />
        ))}
        <span />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_180px_140px_130px_90px_80px_40px] gap-3 items-center px-4 py-3 border-b border-[#e5edf5] last:border-b-0"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-[#f0f3f7] animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="h-3.5 w-32 bg-[#f0f3f7] rounded animate-pulse mb-1.5" />
              <div className="h-3 w-24 bg-[#f0f3f7] rounded animate-pulse" />
            </div>
          </div>
          <div className="h-3.5 w-28 bg-[#f0f3f7] rounded animate-pulse" />
          <div className="h-3.5 w-24 bg-[#f0f3f7] rounded animate-pulse" />
          <div className="h-5 w-20 bg-[#f0f3f7] rounded-full animate-pulse" />
          <div className="h-4 w-14 bg-[#f0f3f7] rounded-full animate-pulse" />
          <div className="h-3.5 w-8 bg-[#f0f3f7] rounded animate-pulse" />
          <div className="h-7 w-7 bg-[#f0f3f7] rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
