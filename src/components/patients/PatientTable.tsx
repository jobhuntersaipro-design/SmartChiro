"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Patient } from "@/types/patient";
import { MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface PatientTableProps {
  patients: Patient[];
  onEdit?: (patient: Patient) => void;
  onDelete?: (patient: Patient) => void;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    active: { bg: "bg-[#E8F5E8]", text: "text-[#30B130]", dot: "bg-[#30B130]", label: "Active" },
    inactive: { bg: "bg-[#FFF8E1]", text: "text-[#9b6829]", dot: "bg-[#F5A623]", label: "Inactive" },
    discharged: { bg: "bg-[#F0F0F0]", text: "text-[#64748d]", dot: "bg-[#64748d]", label: "Discharged" },
  };
  const c = config[status] || config.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function ActionsMenu({ patient, onView, onEdit, onDelete }: {
  patient: Patient;
  onView: () => void;
  onEdit?: (patient: Patient) => void;
  onDelete?: (patient: Patient) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] hover:bg-[#f6f9fc] hover:text-[#061b31] transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-20 w-[140px] rounded-[6px] border border-[#e5edf5] bg-white py-1"
          style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.06)" }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onView(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#273951] hover:bg-[#f6f9fc] transition-colors"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.5} /> View
          </button>
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(patient); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#273951] hover:bg-[#f6f9fc] transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} /> Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(patient); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#DF1B41] hover:bg-[#FDE8EC] transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PatientTable({ patients, onEdit, onDelete }: PatientTableProps) {
  const router = useRouter();

  if (patients.length === 0) {
    return (
      <div className="rounded-[6px] border border-[#e5edf5] bg-white p-12 text-center"
        style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
      >
        <p className="text-[15px] text-[#64748d]">No patients found</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden transition-all duration-200 hover:border-[#c1c9d2]"
      style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
    >
      {/* Table header */}
      <div className="grid grid-cols-[1fr_140px_130px_90px_80px_80px_40px] gap-3 px-4 py-2.5 border-b border-[#e5edf5] bg-[#f6f9fc]">
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Patient</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Contact</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Doctor</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Status</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Visits</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">X-Rays</span>
        <span />
      </div>

      {/* Table rows */}
      {patients.map((patient) => {
        const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
        const fullName = `${patient.firstName} ${patient.lastName}`;

        return (
          <div
            key={patient.id}
            onClick={() => router.push(`/dashboard/patients/${patient.id}/details`)}
            className="grid grid-cols-[1fr_140px_130px_90px_80px_80px_40px] gap-3 items-center px-4 py-3 border-b border-[#e5edf5] last:border-b-0 transition-all duration-200 cursor-pointer hover:bg-[#f6f9fc] hover:translate-x-0.5"
          >
            {/* Patient name + IC */}
            <div className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[12px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="text-[15px] font-medium text-[#061b31] block truncate">{fullName}</span>
                {patient.icNumber ? (
                  <span className="text-[13px] text-[#64748d] block truncate">{patient.icNumber}</span>
                ) : patient.email ? (
                  <span className="text-[13px] text-[#64748d] block truncate">{patient.email}</span>
                ) : null}
              </div>
            </div>

            {/* Contact */}
            <div className="min-w-0">
              <span className="text-[14px] text-[#273951] block truncate">{patient.phone || "—"}</span>
              {patient.phone && patient.email && (
                <span className="text-[12px] text-[#64748d] block truncate">{patient.email}</span>
              )}
            </div>

            {/* Doctor */}
            <span className="text-[14px] text-[#273951] truncate">{patient.doctorName}</span>

            {/* Status */}
            <StatusBadge status={patient.status} />

            {/* Visits */}
            <span className="text-[14px] text-[#273951]">{patient.totalVisits}</span>

            {/* X-Rays */}
            <span className="text-[14px] text-[#273951]">{patient.totalXrays}</span>

            {/* Actions */}
            <ActionsMenu
              patient={patient}
              onView={() => router.push(`/dashboard/patients/${patient.id}/details`)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        );
      })}
    </div>
  );
}
