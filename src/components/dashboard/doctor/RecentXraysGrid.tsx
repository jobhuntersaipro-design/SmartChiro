"use client";

import { Image } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../shared/EmptyState";
import type { RecentXray } from "@/types/dashboard";

interface RecentXraysGridProps {
  xrays: RecentXray[];
}

export function RecentXraysGrid({ xrays }: RecentXraysGridProps) {
  if (xrays.length === 0) {
    return (
      <EmptyState
        icon={Image}
        title="No X-rays uploaded yet"
        description="Upload your first X-ray from a patient's profile."
      />
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 px-4">
      {xrays.map((xray) => (
        <Link
          key={xray.id}
          href={`/dashboard/xrays/${xray.patientId}/${xray.id}/annotate`}
          className="flex-shrink-0 group cursor-pointer transition-transform duration-200 hover:scale-105"
        >
          <div className="w-[120px] h-[90px] rounded-[6px] border border-[#e5edf5] overflow-hidden bg-[#1A1F36] mb-2 group-hover:border-[#533afd] transition-all duration-200 group-hover:shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={xray.fileUrl}
              alt={xray.title ?? "X-ray"}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-[13px] font-medium text-[#061b31] truncate w-[120px]">
            {xray.patientName}
          </div>
          <div className="text-[12px] text-[#64748d]">
            {new Date(xray.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        </Link>
      ))}
    </div>
  );
}
