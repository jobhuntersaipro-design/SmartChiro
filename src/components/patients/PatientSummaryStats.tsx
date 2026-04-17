"use client";

interface PatientSummaryStatsProps {
  total: number;
  active: number;
  inactive: number;
  discharged: number;
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3 transition-all duration-200 hover:translate-y-[-1px]"
      style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)" }}
    >
      <p className="text-[22px] font-light text-[#061b31]">{value}</p>
      <p className="text-[13px] text-[#64748d] mt-0.5">{label}</p>
    </div>
  );
}

export function PatientSummaryStats({ total, active, inactive, discharged }: PatientSummaryStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <StatCard value={total} label="Total Patients" />
      <StatCard value={active} label="Active Patients" />
      <StatCard value={inactive} label="Inactive Patients" />
      <StatCard value={discharged} label="Discharged Patients" />
    </div>
  );
}
