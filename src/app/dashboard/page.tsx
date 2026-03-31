import { OverviewSection } from "@/components/dashboard/OverviewSection";
import { TodaysSchedule } from "@/components/dashboard/TodaysSchedule";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Your Overview — full width */}
      <OverviewSection />

      {/* Today's Schedule + Recent Activity — side by side */}
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <TodaysSchedule />
        <RecentActivity />
      </div>
    </div>
  );
}
