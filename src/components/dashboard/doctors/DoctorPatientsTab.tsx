"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Users, ChevronLeft, ChevronRight } from "lucide-react";

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
  active: { bg: "bg-[rgba(21,190,83,0.15)]", text: "text-[#108c3d]" },
  inactive: { bg: "bg-[#F0F3F7]", text: "text-[#64748d]" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients..."
            className="w-full h-9 pl-9 pr-3 rounded-[4px] border border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] placeholder:text-[#64748d] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-[4px] border border-[#e5edf5] bg-white text-[14px] text-[#273951] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5edf5]">
              {["Name", "IC Number", "Phone", "Gender", "Status", "Last Visit", "Visits", "X-Rays"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[12px] font-medium text-[#64748d] uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5edf5]">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-[#F6F9FC] rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Users className="h-8 w-8 mx-auto text-[#e5edf5] mb-2" strokeWidth={1} />
                  <p className="text-[14px] text-[#64748d]">No patients found</p>
                </td>
              </tr>
            ) : (
              patients.map((p) => {
                const colors = statusColors[p.status ?? "active"] ?? statusColors.active;
                return (
                  <tr key={p.id} className="border-b border-[#e5edf5] hover:bg-[#F6F9FC] transition-colors">
                    <td className="px-4 py-3 text-[14px] text-[#061b31] font-medium">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#273951]">
                      {p.icNumber ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#273951]">
                      {p.phone ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#273951]">
                      {p.gender ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-[4px] px-[6px] py-[1px] text-[11px] font-light ${colors.bg} ${colors.text}`}>
                        {p.status ?? "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#64748d]">
                      {p.lastVisit ? formatDate(p.lastVisit) : "-"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#273951]" style={{ fontFeatureSettings: '"tnum"' }}>
                      {p.visitCount}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#273951]" style={{ fontFeatureSettings: '"tnum"' }}>
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
          <div className="px-4 py-3 border-t border-[#e5edf5] flex items-center justify-between">
            <span className="text-[13px] text-[#64748d]">
              {total} patient{total !== 1 ? "s" : ""} total
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 w-8 flex items-center justify-center rounded-[4px] border border-[#e5edf5] hover:bg-[#F6F9FC] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
              </button>
              <span className="text-[13px] text-[#273951]" style={{ fontFeatureSettings: '"tnum"' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-[4px] border border-[#e5edf5] hover:bg-[#F6F9FC] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
