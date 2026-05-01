"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Patient } from "@/types/patient";
import { MoreHorizontal, Eye, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeAppointmentTime, appointmentTimeBucket, buildWhatsAppUrl } from "@/lib/format";

export type SortKey = "upcomingAppointment" | "lastName" | "totalVisits" | "status";
export type SortDir = "asc" | "desc";

interface PatientTableProps {
  patients: Patient[];
  onEdit?: (patient: Patient) => void;
  onDelete?: (patient: Patient) => void;
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSortChange?: (key: SortKey) => void;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    active:     { bg: "#dcfce7", text: "#15803d", dot: "#22c55e", label: "Active"     },
    inactive:   { bg: "#fef3c7", text: "#854d0e", dot: "#eab308", label: "Inactive"   },
    discharged: { bg: "#e2e8f0", text: "#475569", dot: "#94a3b8", label: "Discharged" },
  };
  const c = config[status] || config.active;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold tracking-wide"
      style={{ background: c.bg, color: c.text }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function NextAppointmentCell({ apt }: { apt: Patient["upcomingAppointment"] }) {
  if (!apt) return <span className="text-[13px] text-[#94a3b8]">—</span>;
  const bucket = appointmentTimeBucket(apt.dateTime);
  const text = formatRelativeAppointmentTime(apt.dateTime);
  let style: React.CSSProperties = {};
  let cls = "text-[13px]";
  if (bucket === "today") {
    style = { color: "#533afd" };
    cls += " font-semibold";
  } else if (bucket === "tomorrow") {
    style = { color: "#0570DE" };
    cls += " font-medium";
  } else if (bucket === "thisWeek") {
    style = { color: "#273951" };
  } else {
    style = { color: "#64748d" };
  }
  return (
    <time dateTime={apt.dateTime} className={cls} style={style}>
      {text}
    </time>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onClick: (key: SortKey) => void;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <div
      role="columnheader"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`flex items-center gap-1 text-[13px] font-medium uppercase tracking-[0.04em] transition-colors ${
          active ? "text-[#061b31]" : "text-[#64748d] hover:text-[#061b31]"
        }`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-50"}`} strokeWidth={1.75} />
      </button>
    </div>
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

const COL_GRID = "grid grid-cols-[1fr_180px_140px_140px_100px_80px_40px] gap-3";

export function PatientTable({
  patients,
  onEdit,
  onDelete,
  sortKey = "upcomingAppointment",
  sortDir = "asc",
  onSortChange,
}: PatientTableProps) {
  const router = useRouter();

  const sorted = useMemo(() => {
    const arr = [...patients];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "upcomingAppointment") {
        const aTime = a.upcomingAppointment ? new Date(a.upcomingAppointment.dateTime).getTime() : Infinity;
        const bTime = b.upcomingAppointment ? new Date(b.upcomingAppointment.dateTime).getTime() : Infinity;
        cmp = aTime - bTime;
        // Secondary: lastName when both have no upcoming
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      } else if (sortKey === "lastName") {
        cmp = a.lastName.localeCompare(b.lastName);
        if (cmp === 0) cmp = a.firstName.localeCompare(b.firstName);
      } else if (sortKey === "totalVisits") {
        cmp = a.totalVisits - b.totalVisits;
      } else if (sortKey === "status") {
        cmp = a.status.localeCompare(b.status);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [patients, sortKey, sortDir]);

  if (sorted.length === 0) {
    return (
      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white p-12 text-center"
        style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
      >
        <p className="text-[15px] text-[#64748d]">No patients found</p>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (onSortChange) onSortChange(key);
  };

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden transition-all duration-200 hover:border-[#c1c9d2]"
      style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
    >
      {/* Header */}
      <div className={`${COL_GRID} px-4 py-2.5 border-b border-[#e5edf5] bg-[#f6f9fc] sticky top-0 z-10`}>
        <SortHeader label="Patient" sortKey="lastName" active={sortKey === "lastName"} dir={sortDir} onClick={handleSort} />
        <SortHeader label="Next Appointment" sortKey="upcomingAppointment" active={sortKey === "upcomingAppointment"} dir={sortDir} onClick={handleSort} />
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Contact</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Doctor</span>
        <SortHeader label="Status" sortKey="status" active={sortKey === "status"} dir={sortDir} onClick={handleSort} />
        <SortHeader label="Visits" sortKey="totalVisits" active={sortKey === "totalVisits"} dir={sortDir} onClick={handleSort} />
        <span />
      </div>

      {/* Rows */}
      {sorted.map((patient) => {
        const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
        const fullName = `${patient.firstName} ${patient.lastName}`;
        return (
          <div
            key={patient.id}
            onClick={() => router.push(`/dashboard/patients/${patient.id}/details`)}
            className={`${COL_GRID} items-center px-4 py-3 border-b border-[#e5edf5] last:border-b-0 transition-all duration-200 cursor-pointer hover:bg-[#f6f9fc] hover:translate-x-0.5`}
          >
            {/* Patient name + IC */}
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="h-7 w-7 flex-shrink-0">
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

            {/* Next appointment */}
            <div className="min-w-0">
              <NextAppointmentCell apt={patient.upcomingAppointment} />
            </div>

            {/* Contact — phone links to WhatsApp chat */}
            <div className="min-w-0">
              {patient.phone ? (
                <a
                  href={buildWhatsAppUrl(patient.phone) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[14px] text-[#273951] hover:text-[#25D366] hover:underline underline-offset-2 transition-colors block truncate"
                  title="Open WhatsApp chat"
                >
                  {patient.phone}
                </a>
              ) : (
                <span className="text-[14px] text-[#94a3b8]">—</span>
              )}
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
