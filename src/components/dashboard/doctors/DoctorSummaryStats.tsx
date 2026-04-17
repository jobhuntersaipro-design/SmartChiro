"use client";

import type { DoctorListItem } from "@/types/doctor";

interface DoctorSummaryStatsProps {
  doctors: DoctorListItem[];
}

export function DoctorSummaryStats({ doctors }: DoctorSummaryStatsProps) {
  const total = doctors.length;
  const active = doctors.filter((d) => d.isActive).length;
  const inactive = doctors.filter((d) => !d.isActive).length;
  const totalPatients = doctors.reduce(
    (sum, d) => sum + d.stats.patientCount,
    0
  );

  const stats = [
    { label: "Total Doctors", value: total },
    { label: "Active Doctors", value: active },
    { label: "Inactive Doctors", value: inactive },
    { label: "Total Patients", value: totalPatients },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4"
          style={{
            boxShadow:
              "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
          }}
        >
          <div
            className="text-[26px] font-light text-[#061b31] tracking-[-0.26px]"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {stat.value}
          </div>
          <div className="text-[13px] text-[#64748d]">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
