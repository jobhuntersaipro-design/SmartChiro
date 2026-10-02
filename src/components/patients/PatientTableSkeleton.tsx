"use client";

const SHADOW_CARD =
  "var(--shadow-card)";

export function PatientTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="rounded-panel border border-border bg-white overflow-hidden"
      style={{ boxShadow: SHADOW_CARD }}
    >
      <div className="grid grid-cols-[minmax(220px,300px)_230px_minmax(140px,1fr)_140px_110px_70px_40px] gap-3 px-4 py-2.5 border-b border-border bg-surface-muted">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3 w-16 bg-border rounded animate-pulse" />
        ))}
        <span />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(220px,300px)_230px_minmax(140px,1fr)_140px_110px_70px_40px] gap-3 items-center px-4 py-3 border-b border-border last:border-b-0"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-surface-hover animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="h-3.5 w-32 bg-surface-hover rounded animate-pulse mb-1.5" />
              <div className="h-3 w-24 bg-surface-hover rounded animate-pulse" />
            </div>
          </div>
          <div className="h-3.5 w-28 bg-surface-hover rounded animate-pulse" />
          <div className="h-3.5 w-24 bg-surface-hover rounded animate-pulse" />
          <div className="h-5 w-20 bg-surface-hover rounded-full animate-pulse" />
          <div className="h-4 w-14 bg-surface-hover rounded-full animate-pulse" />
          <div className="h-3.5 w-8 bg-surface-hover rounded animate-pulse" />
          <div className="h-7 w-7 bg-surface-hover rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
