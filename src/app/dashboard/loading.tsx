import { SkeletonStatCards } from "@/components/dashboard/shared/SkeletonCard";
import { SkeletonTable } from "@/components/dashboard/shared/SkeletonTable";

// Instant feedback while a dashboard page's server component loads — the
// sidebar and top bar stay put (they're in the layout), only the content waits.
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 animate-pulse rounded-md bg-[#eef2f7]" />
      <SkeletonStatCards />
      <div className="rounded-[6px] border border-[#e5edf5] bg-white">
        <SkeletonTable rows={6} />
      </div>
    </div>
  );
}
