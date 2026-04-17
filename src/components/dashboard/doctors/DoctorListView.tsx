"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Plus, LayoutGrid, List, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DoctorListItem } from "@/types/doctor";
import { DoctorSummaryStats } from "./DoctorSummaryStats";
import { DoctorCard } from "./DoctorCard";
import { CreateDoctorDialog } from "./CreateDoctorDialog";
import { DoctorDetailSheet } from "./DoctorDetailSheet";
import { RemoveDoctorDialog } from "./RemoveDoctorDialog";

interface DoctorListViewProps {
  userId: string;
  userName: string | null;
  branchRole: string | null;
}

interface BranchOption {
  id: string;
  name: string;
}

export function DoctorListView({
  userId,
  userName,
  branchRole,
}: DoctorListViewProps) {
  const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailDoctor, setDetailDoctor] = useState<DoctorListItem | null>(null);
  const [removeDoctorState, setRemoveDoctorState] = useState<{
    doctor: DoctorListItem;
    branchId: string | null;
    branchName: string | null;
  } | null>(null);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const isAdmin = branchRole === "OWNER" || branchRole === "ADMIN";

  const fetchDoctors = useCallback(async () => {
    try {
      const res = await fetch("/api/doctors");
      if (res.ok) {
        const data = await res.json();
        setDoctors(data.doctors ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // Clear toast after 3s
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Extract unique branches for filter dropdown
  const branchOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctors) {
      for (const b of d.branches) {
        map.set(b.id, b.name);
      }
    }
    return Array.from(map.entries()).map(
      ([id, name]): BranchOption => ({ id, name })
    );
  }, [doctors]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = doctors;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          (d.name ?? "").toLowerCase().includes(q) ||
          d.email.toLowerCase().includes(q)
      );
    }

    if (branchFilter !== "all") {
      result = result.filter((d) =>
        d.branches.some((b) => b.id === branchFilter)
      );
    }

    if (statusFilter === "active") {
      result = result.filter((d) => d.isActive);
    } else if (statusFilter === "inactive") {
      result = result.filter((d) => !d.isActive);
    }

    return result;
  }, [doctors, search, branchFilter, statusFilter]);

  async function handleToggleStatus(doctor: DoctorListItem) {
    try {
      const res = await fetch(`/api/doctors/${doctor.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !doctor.isActive }),
      });

      if (res.ok) {
        setDoctors((prev) =>
          prev.map((d) =>
            d.id === doctor.id ? { ...d, isActive: !d.isActive } : d
          )
        );
        setToast({
          type: "success",
          message: `${doctor.name ?? "Doctor"} ${
            doctor.isActive ? "deactivated" : "activated"
          }`,
        });
      }
    } catch {
      setToast({ type: "error", message: "Failed to update status" });
    }
  }

  function handleRemove(doctor: DoctorListItem) {
    // Pick first branch for removal context
    const branch = doctor.branches[0];
    setRemoveDoctorState({
      doctor,
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
    });
  }

  const pageTitle = isAdmin ? "Doctors" : "Team";
  const pageSubtitle = isAdmin
    ? "Manage your clinic's doctors and staff"
    : "Your clinic team directory";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-32 bg-[#F6F9FC] rounded animate-pulse" />
            <div className="h-4 w-48 bg-[#F6F9FC] rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 bg-[#F6F9FC] rounded-[6px] animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 bg-[#F6F9FC] rounded-[6px] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-[6px] px-4 py-3 text-[14px] font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-[#108c3d] text-white"
              : "bg-[#df1b41] text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-light text-[#061b31] tracking-[-0.22px]">
            {pageTitle}
          </h1>
          <p className="text-[14px] text-[#64748d] mt-0.5">{pageSubtitle}</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-9 rounded-[4px] bg-[#533afd] hover:bg-[#4434d4] text-white text-[14px] font-medium px-4"
          >
            <Plus className="h-4 w-4 mr-1.5" strokeWidth={2} />
            Add Doctor
          </Button>
        )}
      </div>

      {/* Summary Stats */}
      <DoctorSummaryStats doctors={doctors} />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748d]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search doctors..."
            className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] pl-9 text-[14px] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]"
          />
        </div>

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="h-9 rounded-[4px] border border-[#e5edf5] bg-[#F6F9FC] px-3 text-[14px] text-[#061b31] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd] focus:outline-none"
        >
          <option value="all">All Branches</option>
          {branchOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-[4px] border border-[#e5edf5] bg-[#F6F9FC] px-3 text-[14px] text-[#061b31] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd] focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`h-9 w-9 flex items-center justify-center rounded-[4px] transition-colors ${
              viewMode === "grid"
                ? "bg-[#ededfc] text-[#533afd]"
                : "text-[#64748d] hover:bg-[#f6f9fc]"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`h-9 w-9 flex items-center justify-center rounded-[4px] transition-colors ${
              viewMode === "list"
                ? "bg-[#ededfc] text-[#533afd]"
                : "text-[#64748d] hover:bg-[#f6f9fc]"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          hasSearch={!!search || branchFilter !== "all" || statusFilter !== "all"}
          isAdmin={isAdmin}
          onAdd={() => setCreateOpen(true)}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <DoctorCard
              key={d.id}
              doctor={d}
              isAdmin={isAdmin}
              onView={setDetailDoctor}
              onToggleStatus={handleToggleStatus}
              onRemove={handleRemove}
            />
          ))}
        </div>
      ) : (
        <DoctorTable
          doctors={filtered}
          isAdmin={isAdmin}
          onView={setDetailDoctor}
          onToggleStatus={handleToggleStatus}
          onRemove={handleRemove}
        />
      )}

      {/* Dialogs / Sheets */}
      <CreateDoctorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        branches={branchOptions}
        onCreated={() => {
          fetchDoctors();
          setToast({ type: "success", message: "Doctor created" });
        }}
      />

      <DoctorDetailSheet
        doctor={detailDoctor}
        open={!!detailDoctor}
        onOpenChange={(v) => {
          if (!v) setDetailDoctor(null);
        }}
        isAdmin={isAdmin}
        onRemove={(d) => {
          setDetailDoctor(null);
          handleRemove(d);
        }}
      />

      <RemoveDoctorDialog
        doctor={removeDoctorState?.doctor ?? null}
        branchId={removeDoctorState?.branchId ?? null}
        branchName={removeDoctorState?.branchName ?? null}
        open={!!removeDoctorState}
        onOpenChange={(v) => {
          if (!v) setRemoveDoctorState(null);
        }}
        onRemoved={() => {
          fetchDoctors();
          setToast({
            type: "success",
            message: `Doctor removed from ${removeDoctorState?.branchName ?? "branch"}`,
          });
        }}
      />
    </div>
  );
}

// ─── Empty State ───

function EmptyState({
  hasSearch,
  isAdmin,
  onAdd,
}: {
  hasSearch: boolean;
  isAdmin: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-[#F6F9FC] p-4">
        <Stethoscope className="h-8 w-8 text-[#64748d]" strokeWidth={1.5} />
      </div>
      <h3 className="text-[16px] font-medium text-[#061b31] mb-1">
        {hasSearch ? "No doctors found" : "No doctors yet"}
      </h3>
      <p className="text-[14px] text-[#64748d] max-w-[300px]">
        {hasSearch
          ? "Try adjusting your search or filters."
          : "Add your first doctor to get started managing your clinic."}
      </p>
      {!hasSearch && isAdmin && (
        <Button
          onClick={onAdd}
          className="mt-4 h-9 rounded-[4px] bg-[#533afd] hover:bg-[#4434d4] text-white text-[14px] font-medium px-4"
        >
          <Plus className="h-4 w-4 mr-1.5" strokeWidth={2} />
          Add Doctor
        </Button>
      )}
    </div>
  );
}

// ─── Table View ───

function DoctorTable({
  doctors,
  isAdmin,
  onView,
  onToggleStatus,
  onRemove,
}: {
  doctors: DoctorListItem[];
  isAdmin: boolean;
  onView: (d: DoctorListItem) => void;
  onToggleStatus: (d: DoctorListItem) => void;
  onRemove: (d: DoctorListItem) => void;
}) {
  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e5edf5]">
            <th className="text-left px-4 py-3 text-[13px] font-medium text-[#273951] uppercase tracking-wide">
              Name / Email
            </th>
            <th className="text-left px-4 py-3 text-[13px] font-medium text-[#273951] uppercase tracking-wide">
              Branch
            </th>
            <th className="text-left px-4 py-3 text-[13px] font-medium text-[#273951] uppercase tracking-wide">
              Status
            </th>
            <th className="text-right px-4 py-3 text-[13px] font-medium text-[#273951] uppercase tracking-wide">
              Patients
            </th>
            <th className="text-right px-4 py-3 text-[13px] font-medium text-[#273951] uppercase tracking-wide">
              Joined
            </th>
            {isAdmin && (
              <th className="px-4 py-3 w-10" />
            )}
          </tr>
        </thead>
        <tbody>
          {doctors.map((d) => (
            <tr
              key={d.id}
              className="border-b border-[#e5edf5] last:border-b-0 hover:bg-[#F0F3F7] transition-colors cursor-pointer"
              onClick={() => onView(d)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#ededfc] flex items-center justify-center text-[11px] font-medium text-[#533afd] shrink-0">
                    {d.name
                      ? d.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()
                      : d.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-[#061b31]">
                      {d.name ?? "Unnamed"}
                    </div>
                    <div className="text-[13px] text-[#64748d]">{d.email}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {d.branches.map((b) => (
                    <span
                      key={b.id}
                      className="text-[12px] text-[#533afd] bg-[#ededfc] rounded-full px-2 py-0.5"
                    >
                      {b.name}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-[4px] px-[6px] py-[1px] text-[10px] font-light ${
                    d.isActive
                      ? "bg-[rgba(21,190,83,0.2)] text-[#108c3d] border border-[rgba(21,190,83,0.4)]"
                      : "bg-[#F0F3F7] text-[#64748d]"
                  }`}
                >
                  {d.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className="text-[14px] text-[#061b31]"
                  style={{ fontFeatureSettings: '"tnum"' }}
                >
                  {d.stats.patientCount}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-[13px] text-[#64748d]">
                  {new Date(d.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                  })}
                </span>
              </td>
              {isAdmin && (
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStatus(d);
                      }}
                      className="text-[12px] text-[#64748d] hover:text-[#061b31] px-1"
                      title={d.isActive ? "Deactivate" : "Activate"}
                    >
                      {d.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(d);
                      }}
                      className="text-[12px] text-[#df1b41] hover:text-[#c4183c] px-1"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
