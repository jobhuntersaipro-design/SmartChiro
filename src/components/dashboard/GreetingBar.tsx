"use client";

import { Plus } from "lucide-react";
import { BranchPicker } from "./BranchPicker";
import type { BranchRole } from "@prisma/client";

interface GreetingBarProps {
  userName: string | null;
  branchRole: BranchRole | null;
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
  onBranchChange: (branchId: string | null) => void;
  /** Shows the primary "New appointment" action when provided. */
  onNewAppointment?: () => void;
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
  onNewAppointment,
}: GreetingBarProps) {
  const greeting = getGreeting();
  const displayName = userName ?? "there";
  const isDoctor = branchRole === "DOCTOR";

  // Determine branch name to display
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  // A doctor's dashboard is about the branch they're working in (the
  // sidebar's active branch), not the first one in the list.
  const doctorBranchName = selectedBranch?.name ?? (branches.length === 1 ? branches[0].name : null);
  let branchDisplayName: string | null = null;
  if (selectedBranch) {
    branchDisplayName = selectedBranch.name;
  } else if (branches.length === 1) {
    branchDisplayName = branches[0].name;
  } else if (branches.length > 1) {
    branchDisplayName = "All Branches";
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[23px] font-medium tracking-[-0.23px] text-foreground" suppressHydrationWarning>
          {greeting},{" "}
          <span className="font-medium">{displayName}</span>
        </h1>
        {branchDisplayName && (
          <p className="text-[14px] text-fg-secondary mt-0.5 truncate">{branchDisplayName}</p>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {isDoctor ? (
          doctorBranchName && (
            <span
              className="inline-flex max-w-full items-center truncate rounded-full bg-brand-subtle px-3 py-1 text-[14px] font-medium text-brand"
              title={doctorBranchName}
            >
              {doctorBranchName}
            </span>
          )
        ) : (
          <BranchPicker
            branches={branches}
            selectedBranchId={selectedBranchId}
            onBranchChange={onBranchChange}
          />
        )}
        {onNewAppointment && (
          <button
            type="button"
            onClick={onNewAppointment}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-primary px-3 text-[14px] font-medium text-white whitespace-nowrap transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New appointment
          </button>
        )}
      </div>
    </div>
  );
}
