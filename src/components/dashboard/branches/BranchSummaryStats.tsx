"use client";

import { Building2, Stethoscope, Users } from "lucide-react";

interface BranchSummaryStatsProps {
  totalBranches: number;
  totalDoctors: number;
  totalPatients: number;
}

export function BranchSummaryStats({ totalBranches, totalDoctors, totalPatients }: BranchSummaryStatsProps) {
  const stats = [
    { label: "Total Branches", value: totalBranches, icon: Building2, color: "#533afd" },
    { label: "Active Doctors", value: totalDoctors, icon: Stethoscope, color: "#0570DE" },
    { label: "Total Patients", value: totalPatients, icon: Users, color: "#30B130" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4 transition-all duration-200 hover:border-[#c1c9d2]"
          style={{
            boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[4px]"
              style={{ backgroundColor: `${stat.color}10` }}
            >
              <stat.icon className="h-4.5 w-4.5" style={{ color: stat.color }} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[13px] font-normal text-[#64748d]">{stat.label}</p>
              <p className="text-[22px] font-normal text-[#061b31] leading-tight">{stat.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
