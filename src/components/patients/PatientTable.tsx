"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Patient } from "@/types/patient";
import { MoreHorizontal, Eye, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAppointmentDateTime, getAppointmentWeekday } from "@/lib/format";
import { PhoneLinks } from "@/components/patients/PhoneLinks";

export type SortKey = "upcomingAppointment" | "lastName" | "totalVisits" | "status";
export type SortDir = "asc" | "desc";

interface PatientTableProps {
  patients: Patient[];
  onEdit?: (patient: Patient) => void;
  onDelete?: (patient: Patient) => void;
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSortChange?: (key: SortKey) => void;
  /** Show each patient's branch (the list spans several branches). */
  showBranch?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { text: string; dot: string; label: string }> = {
    active:     { text: "#15803d", dot: "#22c55e", label: "Active"     },
    inactive:   { text: "#854d0e", dot: "#eab308", label: "Inactive"   },
    discharged: { text: "#585858", dot: "#7d7d7d", label: "Discharged" },
  };
  const c = config[status] || config.active;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: c.text }}>
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function WeekdayBadge({ label, isWeekend }: { label: string; isWeekend: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[3px] px-1 py-px text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
      style={{
        background: isWeekend ? "#fef3c7" : "#f1f1f1",
        color: isWeekend ? "#854d0e" : "#475569",
      }}
    >
      {label}
    </span>
  );
}

function NextAppointmentCell({ apt }: { apt: Patient["upcomingAppointment"] }) {
  if (!apt) return <span className="text-[13px] text-fg-muted">—</span>;
  const dow = getAppointmentWeekday(apt.dateTime);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {dow && <WeekdayBadge label={dow.label} isWeekend={dow.isWeekend} />}
      <time dateTime={apt.dateTime} className="text-[13px] text-foreground tabular-nums truncate">
        {formatAppointmentDateTime(apt.dateTime)}
      </time>
    </span>
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
          active ? "text-foreground" : "text-fg-secondary hover:text-foreground"
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
        className="flex items-center justify-center h-7 w-7 rounded-md text-fg-secondary hover:bg-surface-muted hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-20 w-35 rounded-panel border border-border bg-white py-1"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onView(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-surface-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.5} /> View
          </button>
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(patient); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-surface-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} /> Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(patient); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-danger hover:bg-danger-subtle transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Flexible minimums (~890 px) so the table fits a laptop next to the sidebar;
// the contact column fits a full number plus its call / WhatsApp icons.
const COL_GRID =
  "grid grid-cols-[minmax(180px,2fr)_minmax(150px,1.4fr)_minmax(175px,1.2fr)_minmax(110px,1fr)_100px_60px_40px] gap-3";

export function PatientTable({
  patients,
  onEdit,
  onDelete,
  sortKey = "upcomingAppointment",
  sortDir = "asc",
  onSortChange,
  showBranch = false,
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
        className="rounded-panel border border-border bg-white p-12 text-center"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <p className="text-[15px] text-fg-secondary">No patients found</p>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (onSortChange) onSortChange(key);
  };

  return (
    <div
      // No overflow-hidden: it clipped the row actions menu.
      className="rounded-panel border border-border bg-white transition-all duration-200 hover:border-border-strong"
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      {/* Header */}
      <div className={`${COL_GRID} px-4 py-2.5 border-b border-border bg-surface-muted rounded-t-panel`}>
        <SortHeader label="Patient" sortKey="lastName" active={sortKey === "lastName"} dir={sortDir} onClick={handleSort} />
        <SortHeader label="Next Appointment" sortKey="upcomingAppointment" active={sortKey === "upcomingAppointment"} dir={sortDir} onClick={handleSort} />
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Contact</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Doctor</span>
        <SortHeader label="Status" sortKey="status" active={sortKey === "status"} dir={sortDir} onClick={handleSort} />
        <SortHeader label="Visits" sortKey="totalVisits" active={sortKey === "totalVisits"} dir={sortDir} onClick={handleSort} />
        <span />
      </div>

      {/* Rows */}
      {sorted.map((patient) => {
        const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
        const fullName = `${patient.firstName} ${patient.lastName}`;
        const href = `/dashboard/patients/${patient.id}/details`;
        return (
          // The whole row opens the patient on click; keyboard users reach the
          // same page through the name link (Enter).
          <div
            key={patient.id}
            onClick={() => router.push(href)}
            className={`${COL_GRID} items-center px-4 py-3 border-b border-border last:border-b-0 last:rounded-b-panel transition-all duration-200 cursor-pointer hover:bg-surface-muted hover:translate-x-0.5`}
          >
            {/* Patient name + IC */}
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="bg-brand-subtle text-brand text-[12px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <Link
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="block truncate rounded-control text-[15px] font-medium text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                >
                  {fullName}
                </Link>
                {patient.icNumber ? (
                  <span className="text-[13px] text-fg-secondary block truncate">{patient.icNumber}</span>
                ) : patient.email ? (
                  <span className="text-[13px] text-fg-secondary block truncate">{patient.email}</span>
                ) : null}
              </div>
            </div>

            {/* Next appointment */}
            <div className="min-w-0">
              <NextAppointmentCell apt={patient.upcomingAppointment} />
            </div>

            {/* Contact — number, call and WhatsApp icons */}
            <div className="min-w-0">
              <PhoneLinks phone={patient.phone} name={fullName} textClassName="text-[14px] text-foreground" className="max-w-full" />
              {patient.phone && patient.email && (
                <span className="text-[12px] text-fg-secondary block truncate">{patient.email}</span>
              )}
            </div>

            {/* Doctor */}
            <div className="min-w-0">
              <span className="text-[14px] text-foreground block truncate">{patient.doctorName}</span>
              {showBranch && patient.branchName && (
                <span className="text-[12px] text-fg-secondary block truncate" title={patient.branchName}>{patient.branchName}</span>
              )}
            </div>

            {/* Status */}
            <StatusBadge status={patient.status} />

            {/* Visits */}
            <span className="text-[14px] text-foreground">{patient.totalVisits}</span>

            {/* Actions */}
            <ActionsMenu
              patient={patient}
              onView={() => router.push(href)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        );
      })}
    </div>
  );
}
