"use client";

import { useState } from "react";
import { Building2, MoreHorizontal, UserPlus, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "../shared/EmptyState";
import type { BranchSummary } from "@/types/dashboard";

interface BranchManagementTableProps {
  branches: BranchSummary[];
  onCreateBranch: () => void;
  onManageDoctors: (branchId: string) => void;
  onEditBranch: (branchId: string) => void;
  onSelectBranch: (branchId: string) => void;
}

export function BranchManagementTable({
  branches,
  onCreateBranch,
  onManageDoctors,
  onEditBranch,
  onSelectBranch,
}: BranchManagementTableProps) {
  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white transition-all duration-200 ease-out hover:border-[#c1c9d2]"
      style={{
        boxShadow:
          "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5edf5]">
        <h3 className="text-[16px] font-normal text-[#061b31]">Branch Management</h3>
        <Button
          onClick={onCreateBranch}
          size="sm"
          className="h-8 px-3 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] font-medium cursor-pointer"
        >
          <Building2 className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
          Create Branch
        </Button>
      </div>

      {/* Content */}
      {branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No branches yet"
          description="Create your first branch to get started."
          action={
            <Button
              onClick={onCreateBranch}
              className="bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] cursor-pointer"
            >
              Create Branch
            </Button>
          }
        />
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5edf5]">
              <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">
                Branch Name
              </th>
              <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">
                Doctors
              </th>
              <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">
                Patients
              </th>
              <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">
                {"Today's Appts"}
              </th>
              <th className="px-5 py-2.5 text-left text-[14px] font-medium text-[#64748d]">
                Status
              </th>
              <th className="px-5 py-2.5 text-right text-[14px] font-medium text-[#64748d]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <BranchRow
                key={branch.id}
                branch={branch}
                onManageDoctors={() => onManageDoctors(branch.id)}
                onEditBranch={() => onEditBranch(branch.id)}
                onSelectBranch={() => onSelectBranch(branch.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BranchRow({
  branch,
  onManageDoctors,
  onEditBranch,
  onSelectBranch,
}: {
  branch: BranchSummary;
  onManageDoctors: () => void;
  onEditBranch: () => void;
  onSelectBranch: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <tr
      className="border-b border-[#e5edf5] last:border-b-0 hover:bg-[#f6f9fc] transition-colors cursor-pointer"
      onClick={onSelectBranch}
    >
      <td className="px-5 py-3">
        <div className="text-[15px] font-medium text-[#061b31]">{branch.name}</div>
        {branch.address && (
          <div className="text-[13px] text-[#64748d]">{branch.address}</div>
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center">
          {branch.doctors.slice(0, 3).map((doc, i) => {
            const initials = (doc.name ?? "?")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2);
            return (
              <Avatar
                key={doc.id}
                className="h-7 w-7 border-2 border-white"
                style={{ marginLeft: i > 0 ? "-6px" : 0 }}
              >
                <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[11px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
            );
          })}
          {branch.doctorCount > 3 && (
            <span className="ml-1.5 text-[13px] text-[#64748d]">
              +{branch.doctorCount - 3}
            </span>
          )}
          {branch.doctorCount === 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onManageDoctors();
              }}
              className="text-[13px] text-[#533afd] hover:text-[#4434d4] font-medium cursor-pointer"
            >
              Add doctors
            </button>
          )}
        </div>
      </td>
      <td className="px-5 py-3 text-[15px] text-[#273951]">{branch.patientCount}</td>
      <td className="px-5 py-3 text-[15px] text-[#273951]">{branch.todayAppointments}</td>
      <td className="px-5 py-3">
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium bg-[#ECFDF5] text-[#15be53]">
          Active
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        <div className="relative inline-block">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-[#64748d] hover:bg-[#f6f9fc] hover:text-[#061b31] transition-all duration-200 cursor-pointer hover:scale-110 active:scale-95"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-[6px] border border-[#e5edf5] bg-white py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                style={{
                  boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onEditBranch();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-[#061b31] hover:bg-[#f6f9fc] transition-all duration-200 cursor-pointer group/item hover:translate-x-0.5"
                >
                  <Pencil className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
                  Edit Branch
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onManageDoctors();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-[#061b31] hover:bg-[#f6f9fc] transition-all duration-200 cursor-pointer group/item hover:translate-x-0.5"
                >
                  <UserPlus className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
                  Manage Doctors
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onSelectBranch();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-[#061b31] hover:bg-[#f6f9fc] transition-all duration-200 cursor-pointer group/item hover:translate-x-0.5"
                >
                  <Eye className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
                  View Details
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
