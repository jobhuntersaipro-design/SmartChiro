"use client";

import { BranchPicker } from "./BranchPicker";
import type { BranchRole } from "@prisma/client";

interface GreetingBarProps {
  userName: string | null;
  branchRole: BranchRole | null;
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
  onBranchChange: (branchId: string | null) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function GreetingBar({
  userName,
  branchRole,
  branches,
  selectedBranchId,
  onBranchChange,
}: GreetingBarProps) {
  const greeting = getGreeting();
  const displayName = userName ?? "there";
  const isDoctor = branchRole === "DOCTOR";

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-[23px] font-light tracking-[-0.23px] text-[#061b31]">
        {greeting},{" "}
        <span className="font-medium">{displayName}</span>
      </h1>

      {isDoctor ? (
        // Doctor sees a static branch label
        branches.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-[#ededfc] px-3 py-1 text-[14px] font-medium text-[#533afd]">
            {branches[0]?.name}
          </span>
        )
      ) : (
        // Owner/Admin sees a branch picker
        <BranchPicker
          branches={branches}
          selectedBranchId={selectedBranchId}
          onBranchChange={onBranchChange}
        />
      )}
    </div>
  );
}
