export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-[#e5edf5]">
        <div className="h-3.5 w-20 rounded bg-[#e5edf5]" />
        <div className="h-3.5 w-24 rounded bg-[#e5edf5]" />
        <div className="h-3.5 w-16 rounded bg-[#e5edf5]" />
        <div className="h-3.5 w-20 rounded bg-[#e5edf5]" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-[#e5edf5] last:border-b-0">
          <div className="h-4 w-28 rounded bg-[#e5edf5]" />
          <div className="h-4 w-20 rounded bg-[#e5edf5]" />
          <div className="h-4 w-12 rounded bg-[#e5edf5]" />
          <div className="h-4 w-16 rounded bg-[#e5edf5]" />
        </div>
      ))}
    </div>
  );
}
