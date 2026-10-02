export function SkeletonCard() {
  return (
    <div
      className="rounded-panel border border-border bg-white p-5 animate-pulse"
      style={{
        boxShadow:
          "var(--shadow-lg)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-panel bg-border" />
        <div className="h-4 w-10 rounded bg-border" />
      </div>
      <div className="h-8 w-16 rounded bg-border mb-2" />
      <div className="h-4 w-28 rounded bg-border mb-1" />
      <div className="h-3.5 w-36 rounded bg-border" />
    </div>
  );
}

export function SkeletonStatCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
