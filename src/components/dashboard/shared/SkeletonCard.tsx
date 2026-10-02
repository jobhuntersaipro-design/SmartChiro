export function SkeletonCard() {
  return (
    <div
      className="rounded-panel border border-border bg-white p-5 animate-pulse"
      style={{
        boxShadow:
          "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
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
