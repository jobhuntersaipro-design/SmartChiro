"use client";

import { PenTool, UserPlus, Stethoscope, Image, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ActivityItem {
  id: string;
  type: "annotation" | "patient" | "visit" | "xray";
  description: string;
  timestamp: string;
  branchName?: string;
}

const typeIcons: Record<string, LucideIcon> = {
  annotation: PenTool,
  patient: UserPlus,
  visit: Stethoscope,
  xray: Image,
};

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  showBranch?: boolean;
}

export function ActivityFeed({ activities, showBranch = false }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity className="h-5 w-5 text-[#64748d] mb-2" strokeWidth={1.5} />
        <p className="text-[14px] text-[#64748d]">
          No activity yet. Add your first patient to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {activities.slice(0, 8).map((item) => {
        const Icon = typeIcons[item.type] ?? Activity;
        return (
          <div
            key={item.id}
            className="flex items-start gap-3 px-4 py-3 border-b border-[#e5edf5] last:border-b-0 transition-all duration-200 hover:bg-[#f6f9fc] hover:translate-x-1 cursor-default"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F6F9FC] mt-0.5">
              <Icon className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] text-[#273951] leading-snug">
                {item.description}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[13px] text-[#64748d]">
                  {formatRelativeTime(item.timestamp)}
                </span>
                {showBranch && item.branchName && (
                  <span className="text-[13px] text-[#64748d]">
                    &middot; {item.branchName}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
