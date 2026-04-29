"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy } from "lucide-react";

interface Props {
  branchId: string | null;
}

interface DoctorRow {
  doctorId: string;
  name: string;
  image: string | null;
  visitCount: number;
  revenue: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "DR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopDoctorsCard({ branchId }: Props) {
  const [data, setData] = useState<DoctorRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("days", "30");
    params.set("limit", "5");
    if (branchId) params.set("branchId", branchId);
    fetch(`/api/dashboard/top-doctors?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { doctors: [] }))
      .then((d) => {
        if (cancelled) return;
        setData(d.doctors ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const loading = data === null;
  const doctors = data ?? [];

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white"
      style={{
        boxShadow:
          "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
      }}
    >
      <div className="px-5 py-4 border-b border-[#e5edf5]">
        <h3 className="flex items-center gap-2 text-[16px] font-normal text-[#061b31]">
          <Trophy className="h-4 w-4 text-[#F5A623]" strokeWidth={1.5} />
          Top Doctors (30 Days)
        </h3>
        <p className="mt-0.5 text-[12px] text-[#64748d]">Ranked by visit count</p>
      </div>
      <div className="px-2 py-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-[4px] bg-[#f6f9fc] animate-pulse" />
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-[#64748d]">
            No visits yet in the last 30 days.
          </div>
        ) : (
          <ul>
            {doctors.map((d, idx) => (
              <li key={d.doctorId}>
                <Link
                  href={`/dashboard/doctors/${d.doctorId}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[4px] hover:bg-[#f6f9fc] transition-colors"
                >
                  <span className="w-5 text-center text-[13px] font-medium text-[#64748d] tabular-nums">
                    {idx + 1}
                  </span>
                  <Avatar className="h-8 w-8">
                    {d.image ? <AvatarImage src={d.image} alt={d.name} /> : null}
                    <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[12px] font-medium">
                      {getInitials(d.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#061b31] truncate">{d.name}</p>
                    <p className="text-[12px] text-[#64748d]">
                      {d.visitCount} visit{d.visitCount === 1 ? "" : "s"}
                      {d.revenue > 0 && (
                        <span className="ml-1.5 text-[#30B130]">
                          · RM {d.revenue.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
