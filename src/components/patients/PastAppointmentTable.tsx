"use client";

import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Eye,
  Loader2,
} from "lucide-react";
import type { BranchRole } from "@prisma/client";
import {
  formatAppointmentTime,
  formatAppointmentDateOnly,
  getAppointmentWeekday,
} from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PastAppointment } from "@/types/patient";

export type PastSortKey = "when" | "doctor" | "branch" | "status";
export type PastSortDir = "asc" | "desc";

interface PastAppointmentTableProps {
  rows: PastAppointment[];
  total: number;
  page: number;
  pageSize: number;
  patientId: string;
  sortKey: PastSortKey;
  sortDir: PastSortDir;
  onSort: (k: PastSortKey) => void;
  onPageChange: (p: number) => void;
  branchRole: BranchRole | null;
  loading: boolean;
  onEdit: (row: PastAppointment) => void;
  onCreateVisit: (row: PastAppointment) => void;
  onIssueInvoice: (row: PastAppointment) => void;
  onRegenerateInvoice: (invoiceId: string) => void;
}

// When | Doctor | Branch | Status | Visit | Invoice | Actions
const COLS =
  "grid-cols-[160px_180px_140px_minmax(140px,1fr)_110px_120px_36px]";

const SHADOW_CARD =
  "0 0 0 1px rgba(0,0,0,0.04), 0 1px 2px rgba(50,50,93,0.06), 0 1px 1px rgba(0,0,0,0.04)";

function WeekdayBadge({
  label,
  isWeekend,
}: {
  label: string;
  isWeekend: boolean;
}) {
  return (
    <span
      className="inline-flex items-center justify-center px-1 text-[10px] font-semibold uppercase tracking-[0.08em] leading-none flex-shrink-0 tabular-nums"
      style={{
        color: isWeekend ? "#9b6829" : "#94a3b8",
        minWidth: "26px",
      }}
    >
      {label}
    </span>
  );
}

function TimeCell({ iso }: { iso: string }) {
  const dow = getAppointmentWeekday(iso);
  const time = formatAppointmentTime(iso);
  const date = formatAppointmentDateOnly(iso);
  return (
    <div className="flex items-center gap-2 min-w-0">
      {dow && <WeekdayBadge label={dow.label} isWeekend={dow.isWeekend} />}
      <time dateTime={iso} className="flex flex-col leading-tight min-w-0">
        <span className="text-[13px] font-medium text-[#061b31] tabular-nums">
          {time}
        </span>
        <span className="text-[11px] text-[#94a3b8] tabular-nums">{date}</span>
      </time>
    </div>
  );
}

function StatusCell({ row }: { row: PastAppointment }) {
  // Stale takes precedence over the underlying status — surfaces the
  // SCHEDULED-in-the-past condition that needs cleanup.
  const config = (() => {
    if (row.isStale) {
      return { text: "#9b6829", dot: "#d99c45", label: "Stale" };
    }
    switch (row.status) {
      case "COMPLETED":
        return { text: "#108c3d", dot: "#15be53", label: "Completed" };
      case "CANCELLED":
        return { text: "#ea2261", dot: "#ea2261", label: "Cancelled" };
      case "NO_SHOW":
        return { text: "#ea2261", dot: "#ea2261", label: "No-show" };
      case "IN_PROGRESS":
        return { text: "#9b6829", dot: "#d99c45", label: "In progress" };
      case "CHECKED_IN":
        return { text: "#108c3d", dot: "#15be53", label: "Checked-in" };
      default:
        return { text: "#108c3d", dot: "#15be53", label: "Scheduled" };
    }
  })();
  // Pulse the dot for "awaiting" states — Stale (SCHEDULED-past) and
  // IN_PROGRESS-stuck — so they read as needing attention. Terminal states
  // (Completed/Cancelled/No-show) stay still. Mirrors UpcomingAppointmentsSection.
  const isLive =
    row.isStale || row.status === "IN_PROGRESS" || row.status === "SCHEDULED";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] font-medium leading-none"
      style={{ color: config.text }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isLive ? "animate-subtle-blink" : ""}`}
        style={{ background: config.dot }}
      />
      {config.label}
    </span>
  );
}

function InvoiceCell({
  row,
  branchRole,
  onIssueInvoice,
}: {
  row: PastAppointment;
  branchRole: BranchRole | null;
  onIssueInvoice: (r: PastAppointment) => void;
}) {
  const canManage = branchRole === "OWNER" || branchRole === "ADMIN";
  if (row.invoices.length === 0) {
    if (row.status === "COMPLETED" && canManage) {
      return (
        <button
          type="button"
          onClick={() => onIssueInvoice(row)}
          className="text-[12px] font-medium text-[#533afd] hover:text-[#3f2bd1] cursor-pointer transition-colors duration-200"
        >
          + Issue
        </button>
      );
    }
    return <span className="text-[13px] text-[#cbd5e1]">—</span>;
  }
  if (row.invoices.length === 1) {
    const inv = row.invoices[0];
    const tone = (() => {
      switch (inv.status) {
        case "PAID":
          return { bg: "#e6f8ed", text: "#108c3d", label: "Paid" };
        case "SENT":
          return { bg: "#e6f1fb", text: "#0570DE", label: "Sent" };
        case "OVERDUE":
          return { bg: "#fde8ec", text: "#ea2261", label: "Overdue" };
        case "CANCELLED":
          return { bg: "#f1f5f9", text: "#64748d", label: "Cancelled" };
        default:
          return { bg: "#f5f3ff", text: "#533afd", label: "Draft" };
      }
    })();
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium tabular-nums"
        style={{ background: tone.bg, color: tone.text }}
        title={inv.invoiceNumber}
      >
        RM {inv.amount.toLocaleString()} · {tone.label}
      </span>
    );
  }
  // >1 invoices — show summary text. Popover is a v2 enhancement.
  const sum = row.invoices.reduce((acc, i) => acc + i.amount, 0);
  return (
    <span
      className="text-[12px] text-[#425466] tabular-nums"
      title={row.invoices.map((i) => i.invoiceNumber).join(", ")}
    >
      RM {sum.toLocaleString()} ({row.invoices.length})
    </span>
  );
}

function VisitCell({
  row,
  patientId,
  branchRole,
  onCreateVisit,
}: {
  row: PastAppointment;
  patientId: string;
  branchRole: BranchRole | null;
  onCreateVisit: (r: PastAppointment) => void;
}) {
  const canManage = branchRole === "OWNER" || branchRole === "ADMIN";
  if (row.visit) {
    return (
      <Link
        href={`/dashboard/patients/${patientId}/details?tab=history&sub=visits&visitId=${row.visit.id}`}
        className="text-[12px] font-medium text-[#533afd] hover:text-[#3f2bd1] cursor-pointer transition-colors duration-200"
      >
        View
      </Link>
    );
  }
  if (row.status === "COMPLETED" && canManage) {
    return (
      <button
        type="button"
        onClick={() => onCreateVisit(row)}
        className="text-[12px] font-medium text-[#533afd] hover:text-[#3f2bd1] cursor-pointer transition-colors duration-200"
      >
        + Create
      </button>
    );
  }
  return <span className="text-[13px] text-[#cbd5e1]">—</span>;
}

function SortableHeader({
  label,
  k,
  active,
  dir,
  onSort,
}: {
  label: string;
  k: PastSortKey;
  active: boolean;
  dir: PastSortDir;
  onSort: (k: PastSortKey) => void;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] cursor-pointer transition-colors duration-200 ${
        active
          ? "text-[#533afd]"
          : "text-[#94a3b8] hover:text-[#64748d]"
      }`}
    >
      {label}
      <Icon
        className={`h-3 w-3 ${active ? "opacity-100" : "opacity-50"}`}
        strokeWidth={2}
      />
    </button>
  );
}

function RowActions({
  row,
  branchRole,
  onEdit,
  onRegenerateInvoice,
  patientId,
}: {
  row: PastAppointment;
  branchRole: BranchRole | null;
  onEdit: (r: PastAppointment) => void;
  onRegenerateInvoice: (invoiceId: string) => void;
  patientId: string;
}) {
  const canManage = branchRole === "OWNER" || branchRole === "ADMIN";
  if (!canManage) return null;
  // Pick the first non-PAID invoice as the regenerate target — paid invoices
  // are immutable for revenue accuracy (spec §5.5).
  const regenTarget = row.invoices.find((i) => i.status !== "PAID");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center h-7 w-7 rounded-[4px] text-[#94a3b8] hover:text-[#061b31] hover:bg-[#f6f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#533afd] focus-visible:ring-offset-1 cursor-pointer transition-colors duration-200"
        aria-label="Row actions"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onEdit(row)}>
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          Edit notes/status
        </DropdownMenuItem>
        {regenTarget && (
          <DropdownMenuItem
            onClick={() => onRegenerateInvoice(regenTarget.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Regenerate invoice
          </DropdownMenuItem>
        )}
        {row.visit && (
          <DropdownMenuItem
            render={
              <Link
                href={`/dashboard/patients/${patientId}/details?tab=history&sub=visits&visitId=${row.visit.id}`}
              />
            }
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            View visit
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PastAppointmentTable({
  rows,
  total,
  page,
  pageSize,
  patientId,
  sortKey,
  sortDir,
  onSort,
  onPageChange,
  branchRole,
  loading,
  onEdit,
  onCreateVisit,
  onIssueInvoice,
  onRegenerateInvoice,
}: PastAppointmentTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize;
  const rangeStart = total === 0 ? 0 : startIdx + 1;
  const rangeEnd = Math.min(total, startIdx + rows.length);

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-x-auto"
      style={{ boxShadow: SHADOW_CARD }}
    >
      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#64748d]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={2} />
          <span className="text-[13px]">Loading…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Calendar
            className="h-7 w-7 text-[#cbd5e1] mx-auto mb-2"
            strokeWidth={1.5}
          />
          <p className="text-[14px] text-[#64748d]">
            No appointments match the current filters.
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div
            className={`grid ${COLS} gap-4 px-4 py-2 border-b border-[#e5edf5] bg-[#fafbfd]`}
          >
            <SortableHeader
              label="When"
              k="when"
              active={sortKey === "when"}
              dir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Doctor"
              k="doctor"
              active={sortKey === "doctor"}
              dir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Branch"
              k="branch"
              active={sortKey === "branch"}
              dir={sortDir}
              onSort={onSort}
            />
            <SortableHeader
              label="Status"
              k="status"
              active={sortKey === "status"}
              dir={sortDir}
              onSort={onSort}
            />
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#94a3b8]">
              Visit
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#94a3b8]">
              Invoice
            </span>
            <span aria-hidden />
          </div>
          {/* Rows */}
          {rows.map((r) => (
            <div
              key={r.id}
              className={`grid ${COLS} gap-4 items-center px-4 h-12 border-b border-[#eef2f7] last:border-b-0 hover:bg-[#fafbfd] transition-colors duration-200`}
            >
              <TimeCell iso={r.dateTime} />
              <Link
                href={`/dashboard/doctors/${r.doctor.id}`}
                className="text-[14px] text-[#425466] hover:text-[#533afd] transition-colors duration-200 truncate"
              >
                {r.doctor.name}
              </Link>
              <Link
                href={`/dashboard/branches/${r.branch.id}`}
                className="text-[13px] text-[#425466] hover:text-[#533afd] transition-colors duration-200 truncate"
              >
                {r.branch.name}
              </Link>
              <StatusCell row={r} />
              <VisitCell
                row={r}
                patientId={patientId}
                branchRole={branchRole}
                onCreateVisit={onCreateVisit}
              />
              <InvoiceCell
                row={r}
                branchRole={branchRole}
                onIssueInvoice={onIssueInvoice}
              />
              <RowActions
                row={r}
                branchRole={branchRole}
                onEdit={onEdit}
                onRegenerateInvoice={onRegenerateInvoice}
                patientId={patientId}
              />
            </div>
          ))}
          {/* Pager */}
          <div className="flex items-center justify-between gap-3 px-4 h-10 border-t border-[#e5edf5] bg-[#fafbfd]">
            <span className="text-[12px] text-[#64748d] tabular-nums">
              Showing{" "}
              <span className="text-[#273951] font-medium">
                {rangeStart}–{rangeEnd}
              </span>{" "}
              of <span className="text-[#273951] font-medium">{total}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                className="inline-flex items-center justify-center h-7 w-7 rounded-[4px] border border-[#e5edf5] bg-white text-[#64748d] hover:text-[#061b31] hover:border-[#cbd5e1] disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer transition-colors duration-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <span className="text-[12px] text-[#64748d] tabular-nums px-2 min-w-[64px] text-center">
                Page{" "}
                <span className="text-[#273951] font-medium">{page}</span> of{" "}
                <span className="text-[#273951] font-medium">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="inline-flex items-center justify-center h-7 w-7 rounded-[4px] border border-[#e5edf5] bg-white text-[#64748d] hover:text-[#061b31] hover:border-[#cbd5e1] disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer transition-colors duration-200"
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
