"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  icNumber: string | null;
  phone: string | null;
  gender: string | null;
  status: string | null;
  lastVisit: string | null;
  visitCount: number;
  xrayCount: number;
}

interface DoctorPatientsTabProps {
  doctorId: string;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-success-subtle", text: "text-success" },
  inactive: { bg: "bg-surface-hover", text: "text-fg-secondary" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DoctorPatientsTab({ doctorId }: DoctorPatientsTabProps) {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const limit = 20;

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status: statusFilter,
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/doctors/${doctorId}/patients?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [doctorId, page, search, statusFilter]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients..."
            className="w-full h-9 pl-9 pr-3 rounded-control border border-border bg-surface-muted text-[14px] text-foreground placeholder:text-fg-secondary focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-control border border-border bg-white text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-panel border border-border bg-white overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Name", "IC Number", "Phone", "Gender", "Status", "Last Visit", "Visits", "X-Rays"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[12px] font-medium text-fg-secondary uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-surface-muted rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Users className="h-8 w-8 mx-auto text-border mb-2" strokeWidth={1} />
                  <p className="text-[14px] text-fg-secondary">No patients found</p>
                </td>
              </tr>
            ) : (
              patients.map((p) => {
                const colors = statusColors[p.status ?? "active"] ?? statusColors.active;
                return (
                  <tr key={p.id} className="border-b border-border hover:bg-surface-muted transition-colors">
                    <td className="px-4 py-3 text-[14px] text-foreground font-medium whitespace-nowrap">
                      <Link href={`/dashboard/patients/${p.id}/details`} className="hover:text-brand hover:underline">
                        {p.firstName} {p.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground whitespace-nowrap">
                      {p.icNumber ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground whitespace-nowrap">
                      {p.phone ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground whitespace-nowrap">
                      {p.gender ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-1.5 py-0.25 text-[11px] font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}>
                        {p.status ?? "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-fg-secondary whitespace-nowrap">
                      {p.lastVisit ? formatDate(p.lastVisit) : "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground" style={{ fontFeatureSettings: '"tnum"' }}>
                      {p.visitCount}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground" style={{ fontFeatureSettings: '"tnum"' }}>
                      {p.xrayCount}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <span className="text-[13px] text-fg-secondary">
              {total} patient{total !== 1 ? "s" : ""} total
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 w-8 flex items-center justify-center rounded-control border border-border hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
              </button>
              <span className="text-[13px] text-foreground" style={{ fontFeatureSettings: '"tnum"' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-control border border-border hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
