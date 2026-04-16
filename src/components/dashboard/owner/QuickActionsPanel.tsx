"use client";

import { Building2, UserPlus, UserRoundPlus, CalendarPlus, Upload } from "lucide-react";
import Link from "next/link";
import type { BranchRole } from "@prisma/client";

interface QuickActionsPanelProps {
  branchRole: BranchRole | null;
  onCreateBranch: () => void;
  onAddDoctor: () => void;
}

export function QuickActionsPanel({
  branchRole,
  onCreateBranch,
  onAddDoctor,
}: QuickActionsPanelProps) {
  const isOwner = branchRole === "OWNER";

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white p-4"
      style={{
        boxShadow:
          "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
      }}
    >
      <h3 className="text-[14px] font-normal text-[#061b31] mb-3 px-1">Quick Actions</h3>
      <div className="space-y-1">
        {isOwner && (
          <QuickActionButton
            icon={Building2}
            label="Add Branch"
            onClick={onCreateBranch}
          />
        )}
        <QuickActionButton
          icon={UserPlus}
          label="Add Doctor"
          onClick={onAddDoctor}
        />
        <QuickActionLink
          icon={UserRoundPlus}
          label="Add Patient"
          href="/dashboard/patients?add=true"
        />
        <QuickActionLink
          icon={CalendarPlus}
          label="New Appointment"
          href="/dashboard/calendar"
        />
        <QuickActionLink
          icon={Upload}
          label="Upload X-Ray"
          href="/dashboard/patients"
        />
      </div>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 rounded-[4px] text-[14px] font-medium text-[#061b31] hover:bg-[#f6f9fc] transition-colors cursor-pointer"
    >
      <Icon className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
      {label}
    </button>
  );
}

function QuickActionLink({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-[4px] text-[14px] font-medium text-[#061b31] hover:bg-[#f6f9fc] transition-colors cursor-pointer"
    >
      <Icon className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
      {label}
    </Link>
  );
}
