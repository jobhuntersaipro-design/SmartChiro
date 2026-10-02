"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BranchPatient, BranchMemberDetail } from "@/types/branch";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

interface BranchPatientsTabProps {
  branchId: string;
  members: BranchMemberDetail[];
}

export function BranchPatientsTab({ branchId, members }: BranchPatientsTabProps) {
  const router = useRouter();
  const [patients, setPatients] = useState<BranchPatient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (doctorFilter) params.set("doctorId", doctorFilter);
      const res = await fetch(`/api/branches/${branchId}/patients?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [branchId, page, search, doctorFilter]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
          <Input
            placeholder="Search patients..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-9 rounded-md border-border bg-surface-muted text-[14px] placeholder:text-fg-secondary focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <select
          value={doctorFilter}
          onChange={(e) => { setDoctorFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-border bg-surface-muted px-3 text-[14px] text-foreground focus:border-brand focus:ring-1 focus:ring-brand cursor-pointer"
        >
          <option value="">All Doctors</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        <span className="text-[14px] text-fg-secondary shrink-0">
          {total} patient{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div
        className="rounded-panel border border-border bg-white overflow-x-auto"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 rounded bg-border animate-pulse" />)}
          </div>
        ) : patients.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto text-border mb-2" strokeWidth={1} />
            <p className="text-[15px] text-fg-secondary">
              {search || doctorFilter ? "No patients match your filters." : "No patients in this branch yet."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-fg-secondary whitespace-nowrap">Name</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-fg-secondary whitespace-nowrap">Doctor</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-fg-secondary whitespace-nowrap">Last Visit</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-fg-secondary whitespace-nowrap">X-Rays</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-fg-secondary whitespace-nowrap">Visits</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/patients/${p.id}/details`)}
                >
                  <td className="px-5 py-3">
                    <div className="text-[15px] font-medium text-foreground whitespace-nowrap">
                      {p.firstName} {p.lastName}
                    </div>
                    {p.email && <div className="text-[13px] text-fg-secondary truncate max-w-60" title={p.email}>{p.email}</div>}
                  </td>
                  <td className="px-5 py-3 text-[14px] text-foreground whitespace-nowrap">
                    {p.doctor?.name ?? "Unassigned"}
                  </td>
                  <td className="px-5 py-3 text-[14px] text-foreground whitespace-nowrap">
                    {p.lastVisitDate
                      ? new Date(p.lastVisitDate).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE, month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-[14px] text-foreground">{p.xrayCount}</td>
                  <td className="px-5 py-3 text-[14px] text-foreground">{p.visitCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-fg-secondary">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-8 w-8 p-0 rounded-md border-border cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className={`h-8 w-8 p-0 rounded-md text-[13px] cursor-pointer ${
                    page === pageNum
                      ? "bg-primary hover:bg-primary/90 text-white"
                      : "border-border text-foreground"
                  }`}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-8 w-8 p-0 rounded-md border-border cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
