"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, Search, LayoutGrid, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BranchWithStats } from "@/types/branch";
import type { CreateBranchData } from "@/types/branch";
import { BranchCard } from "./BranchCard";
import { BranchSummaryStats } from "./BranchSummaryStats";
import { DeleteBranchDialog } from "./DeleteBranchDialog";
import { EditBranchDialog } from "./EditBranchDialog";
import type { EditBranchFormData } from "./edit-branch-form";
import { CreateBranchDialog } from "../owner/CreateBranchDialog";
import { EmptyState } from "../shared/EmptyState";

interface BranchListViewProps {
  userName: string | null;
}

export function BranchListView({ userName }: BranchListViewProps) {
  const router = useRouter();

  const [branches, setBranches] = useState<BranchWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBranchId, setDeleteBranchId] = useState("");
  const [deleteBranchName, setDeleteBranchName] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<BranchWithStats | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/branches?include=stats");
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const filtered = useMemo(() => {
    if (!search.trim()) return branches;
    const q = search.toLowerCase();
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.address ?? "").toLowerCase().includes(q) ||
        (b.city ?? "").toLowerCase().includes(q)
    );
  }, [branches, search]);

  const totals = useMemo(() => ({
    branches: branches.length,
    doctors: branches.reduce((sum, b) => sum + b.doctorCount, 0),
    patients: branches.reduce((sum, b) => sum + b.patientCount, 0),
  }), [branches]);

  async function handleCreateBranch(data: CreateBranchData) {
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    await fetchBranches();
  }

  async function handleDeleteBranch(branchId: string) {
    const res = await fetch(`/api/branches/${branchId}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    await fetchBranches();
  }

  function handleEdit(branchId: string) {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return;
    setEditBranch(branch);
    setEditOpen(true);
  }

  async function handleSaveBranch(branchId: string, payload: Partial<EditBranchFormData>) {
    const res = await fetch(`/api/branches/${branchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to save changes");
    }
    await fetchBranches();
  }

  function handleDelete(branchId: string) {
    const branch = branches.find((b) => b.id === branchId);
    setDeleteBranchId(branchId);
    setDeleteBranchName(branch?.name ?? "");
    setDeleteOpen(true);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-[#e5edf5] animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-[6px] bg-[#e5edf5] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-[6px] bg-[#e5edf5] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[23px] font-normal text-[#061b31]">Branches</h1>
          <p className="text-[15px] text-[#64748d]">Manage your clinic locations</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-9 px-4 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] font-medium cursor-pointer"
        >
          <Plus className="h-4 w-4 mr-1.5" strokeWidth={2} />
          Create Branch
        </Button>
      </div>

      {/* Summary Stats */}
      {branches.length > 0 && (
        <BranchSummaryStats
          totalBranches={totals.branches}
          totalDoctors={totals.doctors}
          totalPatients={totals.patients}
        />
      )}

      {/* Search + View Toggle */}
      {branches.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
            <Input
              placeholder="Search branches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-[4px] border-[#e5edf5] bg-[#f6f9fc] text-[14px] placeholder:text-[#64748d] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]"
            />
          </div>
          <div className="flex rounded-[4px] border border-[#e5edf5] overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex h-9 w-9 items-center justify-center transition-colors cursor-pointer ${
                viewMode === "grid" ? "bg-[#ededfc] text-[#533afd]" : "bg-white text-[#64748d] hover:bg-[#f6f9fc]"
              }`}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex h-9 w-9 items-center justify-center border-l border-[#e5edf5] transition-colors cursor-pointer ${
                viewMode === "list" ? "bg-[#ededfc] text-[#533afd]" : "bg-white text-[#64748d] hover:bg-[#f6f9fc]"
              }`}
            >
              <List className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      {/* Branch Grid / List */}
      {branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No branches yet"
          description="Create your first branch to get started managing your clinic locations."
          action={
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] cursor-pointer"
            >
              Create Branch
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[15px] text-[#64748d]">No branches match your search.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((branch) => (
            <BranchCard
              key={branch.id}
              branch={branch}
              userRole={branch.userRole}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        /* List / Table view */
        <div
          className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden"
          style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5edf5]">
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Branch Name</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Doctors</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Patients</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">{"Today's Appts"}</th>
                <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((branch) => (
                <tr
                  key={branch.id}
                  className="border-b border-[#e5edf5] last:border-b-0 hover:bg-[#f6f9fc] transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
                >
                  <td className="px-5 py-3">
                    <div className="text-[15px] font-medium text-[#061b31]">{branch.name}</div>
                    <div className="text-[13px] text-[#64748d]">{branch.address ?? "No address"}</div>
                  </td>
                  <td className="px-5 py-3 text-[15px] text-[#273951]">{branch.doctorCount}</td>
                  <td className="px-5 py-3 text-[15px] text-[#273951]">{branch.patientCount}</td>
                  <td className="px-5 py-3 text-[15px] text-[#273951]">{branch.todayAppointments}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium bg-[#ECFDF5] text-[#15be53]">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <CreateBranchDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateBranch={handleCreateBranch}
        ownerName={userName}
      />
      <EditBranchDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        branch={editBranch}
        ownerName={userName}
        onSubmit={handleSaveBranch}
      />
      <DeleteBranchDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        branchName={deleteBranchName}
        branchId={deleteBranchId}
        onConfirm={handleDeleteBranch}
      />
    </div>
  );
}
