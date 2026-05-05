"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  X,
} from "lucide-react";
import {
  formatAppointmentTime,
  formatAppointmentDateOnly,
  getAppointmentWeekday,
  buildWhatsAppUrl,
} from "@/lib/format";
import { AppointmentActionsMenu } from "@/components/patients/AppointmentActionsMenu";
import { EditAppointmentDialog } from "@/components/patients/EditAppointmentDialog";
import { CancelAppointmentDialog } from "@/components/patients/CancelAppointmentDialog";
import { DeleteAppointmentDialog } from "@/components/patients/DeleteAppointmentDialog";

type Range = "today" | "week" | "month";

interface UpcomingAppointment {
  id: string;
  dateTime: string;
  duration: number;
  status: string;
  notes: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
  };
  doctor: { id: string; name: string };
  branch: { id: string; name: string };
}

const SHADOW_CARD =
  "0 0 0 1px rgba(0,0,0,0.04), 0 1px 2px rgba(50,50,93,0.06), 0 1px 1px rgba(0,0,0,0.04)";

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  week: "This Week",
  month: "Next 30 Days",
};

const COLLAPSE_KEY = "smartchiro:upcoming-appts:collapsed";

type SortKey = "when" | "patient" | "doctor" | "branch" | "status";
type SortDir = "asc" | "desc";

const ALL = "__all__";

function StatusCell({ status }: { status: string }) {
  const config: Record<string, { text: string; dot: string; label: string }> = {
    SCHEDULED:   { text: "#108c3d", dot: "#15be53", label: "Scheduled"   },
    CHECKED_IN:  { text: "#108c3d", dot: "#15be53", label: "Checked-in"  },
    IN_PROGRESS: { text: "#9b6829", dot: "#d99c45", label: "In progress" },
    COMPLETED:   { text: "#64748d", dot: "#94a3b8", label: "Completed"   },
    CANCELLED:   { text: "#ea2261", dot: "#ea2261", label: "Cancelled"   },
    NO_SHOW:     { text: "#ea2261", dot: "#ea2261", label: "No-show"     },
  };
  const c = config[status] ?? config.SCHEDULED;
  // Pulse the dot only for SCHEDULED — communicates "awaiting" without
  // attaching motion to the label or to terminal states like Completed/Cancelled.
  const isLive = status === "SCHEDULED";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] font-medium leading-none"
      style={{ color: c.text }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isLive ? "animate-subtle-blink" : ""}`}
        style={{ background: c.dot }}
      />
      {c.label}
    </span>
  );
}

function WeekdayBadge({ label, isWeekend }: { label: string; isWeekend: boolean }) {
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
        <span className="text-[11px] text-[#94a3b8] tabular-nums">
          {date}
        </span>
      </time>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <Calendar className="h-7 w-7 text-[#cbd5e1] mx-auto mb-2" strokeWidth={1.5} />
      <p className="text-[14px] text-[#64748d]">{message}</p>
    </div>
  );
}

function SortableHeader({
  label,
  k,
  active,
  dir,
  onSort,
}: {
  label: string;
  k: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] cursor-pointer transition-colors ${
        active ? "text-[#533afd]" : "text-[#94a3b8] hover:text-[#64748d]"
      }`}
    >
      {label}
      <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-50"}`} strokeWidth={2} />
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  if (options.length <= 1) return null;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none cursor-pointer text-[13px] text-[#273951] bg-white border border-[#e5edf5] rounded-[4px] h-7 pl-2.5 pr-7 hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#533afd]/30 focus:border-[#533afd] transition-colors"
      >
        <option value={ALL}>All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none"
        strokeWidth={2}
      />
    </div>
  );
}

const PAGE_SIZE = 10;
// When | Patient | Doctor | Branch | Status | Contact
// Branch absorbs extra space because branch names are typically the longest
// ("SmartChiro Penang Georgetown"). Patient is capped so it stops dominating.
const COLS = "grid-cols-[160px_180px_140px_minmax(160px,1fr)_120px_36px_36px]";

interface UpcomingAppointmentsSectionProps {
  currentUserId?: string;
  isAdmin?: boolean;
}

export function UpcomingAppointmentsSection({
  currentUserId,
  isAdmin = false,
}: UpcomingAppointmentsSectionProps = {}) {
  const [range, setRange] = useState<Range>("week");
  const [appointments, setAppointments] = useState<UpcomingAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [doctorFilter, setDoctorFilter] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  // Action dialogs — track which appointment id is being edited / cancelled / deleted
  const [editId, setEditId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<UpcomingAppointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UpcomingAppointment | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLLAPSE_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore persistence errors
      }
      return next;
    });
  }, []);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/upcoming?range=${r}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAppointments(data.appointments ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setAppointments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!collapsed) load(range);
  }, [range, load, collapsed]);

  // Branches and doctors that exist in the current dataset (basis for filter dropdowns)
  const branchOptions = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach((a) => map.set(a.branch.id, a.branch.name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [appointments]);

  const doctorOptions = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach((a) => map.set(a.doctor.id, a.doctor.name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [appointments]);

  // NOTE: do NOT nest setSortDir inside a setSortKey functional updater —
  // React StrictMode invokes updaters twice in dev, which would flip the
  // direction back to its original value and make sort appear broken.
  const onSort = useCallback(
    (k: SortKey) => {
      if (sortKey === k) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(k);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const filteredSorted = useMemo(() => {
    const filtered = appointments.filter(
      (a) =>
        (branchFilter === ALL || a.branch.id === branchFilter) &&
        (doctorFilter === ALL || a.doctor.id === doctorFilter),
    );
    const cmp = (a: UpcomingAppointment, b: UpcomingAppointment): number => {
      switch (sortKey) {
        case "when":    return a.dateTime.localeCompare(b.dateTime);
        case "patient": return `${a.patient.lastName} ${a.patient.firstName}`
                             .localeCompare(`${b.patient.lastName} ${b.patient.firstName}`);
        case "doctor":  return a.doctor.name.localeCompare(b.doctor.name);
        case "branch":  return a.branch.name.localeCompare(b.branch.name);
        case "status":  return a.status.localeCompare(b.status);
        default:        return 0;
      }
    };
    const sorted = [...filtered].sort((a, b) => {
      const c = cmp(a, b);
      return sortDir === "asc" ? c : -c;
    });
    return sorted;
  }, [appointments, branchFilter, doctorFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  // Clamp page when filters/sort/range/data change so we don't land on an empty page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  // Reset to page 1 whenever the *user* changes the slice we're paginating over.
  useEffect(() => {
    setPage(1);
  }, [branchFilter, doctorFilter, sortKey, sortDir, range]);

  const startIdx = (page - 1) * PAGE_SIZE;
  const visible = filteredSorted.slice(startIdx, startIdx + PAGE_SIZE);
  const rangeStart = filteredSorted.length === 0 ? 0 : startIdx + 1;
  const rangeEnd = Math.min(filteredSorted.length, startIdx + PAGE_SIZE);
  const hasActiveFilter = branchFilter !== ALL || doctorFilter !== ALL;

  const clearFilters = () => {
    setBranchFilter(ALL);
    setDoctorFilter(ALL);
  };

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden mb-5"
      style={{ boxShadow: SHADOW_CARD }}
    >
      {/* Row 1 — title + range tabs */}
      <div className="flex items-center justify-between gap-3 px-4 h-12 border-b border-[#e5edf5]">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="upcoming-appointments-body"
          className="group flex items-center gap-2 min-w-0 -mx-1 px-1 py-1 rounded-[4px] hover:bg-[#f6f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#533afd] focus-visible:ring-offset-1 cursor-pointer transition-colors"
        >
          <ChevronDown
            className={`h-4 w-4 text-[#94a3b8] transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
            strokeWidth={2}
          />
          <Calendar className="h-4 w-4 text-[#533afd]" strokeWidth={1.75} />
          <h2 className="text-[15px] font-semibold text-[#061b31] truncate">
            Upcoming Appointments
          </h2>
          {!loading && total > 0 && (
            <span className="text-[13px] text-[#94a3b8] tabular-nums">
              {hasActiveFilter ? `${filteredSorted.length} / ${total}` : total}
            </span>
          )}
        </button>

        {!collapsed && (
          <nav
            className="flex items-center gap-3 flex-shrink-0 text-[13px]"
            aria-label="Appointment range"
          >
            {(["today", "week", "month"] as const).map((r, i) => (
              <span key={r} className="flex items-center gap-3">
                {i > 0 && <span className="text-[#cbd5e1]" aria-hidden>·</span>}
                <button
                  onClick={() => setRange(r)}
                  aria-current={range === r ? "page" : undefined}
                  className={`cursor-pointer transition-colors ${
                    range === r
                      ? "text-[#533afd] font-medium"
                      : "text-[#64748d] hover:text-[#061b31]"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Row 2 — filters (only when expanded and there's something to filter) */}
      {!collapsed && (branchOptions.length > 1 || doctorOptions.length > 1) && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e5edf5] bg-[#fafbfd]">
          <span className="text-[12px] text-[#94a3b8] uppercase tracking-[0.06em] font-medium mr-1">
            Filter
          </span>
          <FilterSelect
            label="Branch"
            value={branchFilter}
            options={branchOptions}
            onChange={setBranchFilter}
          />
          <FilterSelect
            label="Doctor"
            value={doctorFilter}
            options={doctorOptions}
            onChange={setDoctorFilter}
          />
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[12px] text-[#64748d] hover:text-[#061b31] cursor-pointer transition-colors ml-1"
            >
              <X className="h-3 w-3" strokeWidth={2} />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Body */}
      {!collapsed && (
        <div id="upcoming-appointments-body">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[#64748d]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={2} />
              <span className="text-[13px]">Loading…</span>
            </div>
          ) : appointments.length === 0 ? (
            <EmptyState
              message={`No appointments ${
                range === "today" ? "today" : range === "week" ? "this week" : "in the next 30 days"
              }.`}
            />
          ) : filteredSorted.length === 0 ? (
            <EmptyState message="No appointments match the current filters." />
          ) : (
            <>
              {/* Table header */}
              <div className={`grid ${COLS} gap-4 px-4 py-2 border-b border-[#e5edf5]`}>
                <SortableHeader label="When"    k="when"    active={sortKey === "when"}    dir={sortDir} onSort={onSort} />
                <SortableHeader label="Patient" k="patient" active={sortKey === "patient"} dir={sortDir} onSort={onSort} />
                <SortableHeader label="Doctor"  k="doctor"  active={sortKey === "doctor"}  dir={sortDir} onSort={onSort} />
                <SortableHeader label="Branch"  k="branch"  active={sortKey === "branch"}  dir={sortDir} onSort={onSort} />
                <SortableHeader label="Status"  k="status"  active={sortKey === "status"}  dir={sortDir} onSort={onSort} />
                <span aria-hidden />
                <span aria-hidden />
              </div>
              {visible.map((a) => {
                const wa = buildWhatsAppUrl(a.patient.phone);
                return (
                  <div
                    key={a.id}
                    className={`grid ${COLS} gap-4 items-center px-4 h-11 border-b border-[#eef2f7] last:border-b-0 hover:bg-[#fafbfd] transition-colors`}
                  >
                    <TimeCell iso={a.dateTime} />
                    <Link
                      href={`/dashboard/patients/${a.patient.id}/details`}
                      className="text-[14px] font-medium text-[#061b31] hover:text-[#533afd] transition-colors truncate"
                    >
                      {a.patient.firstName} {a.patient.lastName}
                    </Link>
                    <Link
                      href={`/dashboard/doctors/${a.doctor.id}`}
                      className="text-[14px] text-[#425466] hover:text-[#533afd] transition-colors truncate"
                    >
                      {a.doctor.name}
                    </Link>
                    <Link
                      href={`/dashboard/branches/${a.branch.id}`}
                      className="text-[13px] text-[#425466] hover:text-[#533afd] transition-colors truncate"
                    >
                      {a.branch.name}
                    </Link>
                    <StatusCell status={a.status} />
                    {wa && a.patient.phone ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-[4px] text-[#94a3b8] hover:text-[#25D366] hover:bg-[#f6f9fc] transition-colors cursor-pointer"
                        title={`WhatsApp ${a.patient.phone}`}
                        aria-label={`Open WhatsApp chat with ${a.patient.firstName} ${a.patient.lastName}`}
                      >
                        <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                      </a>
                    ) : (
                      <span className="text-[13px] text-[#cbd5e1] text-center" aria-hidden>—</span>
                    )}
                    <AppointmentActionsMenu
                      canEdit={isAdmin || a.doctor.id === currentUserId}
                      canDelete={isAdmin}
                      onEdit={() => setEditId(a.id)}
                      onCancel={() => setCancelTarget(a)}
                      onDelete={() => setDeleteTarget(a)}
                    />
                  </div>
                );
              })}
              {/* Pager — always visible so the user knows there's a paged surface */}
              <div className="flex items-center justify-between gap-3 px-4 h-10 border-t border-[#e5edf5] bg-[#fafbfd]">
                <span className="text-[12px] text-[#64748d] tabular-nums">
                  Showing <span className="text-[#273951] font-medium">{rangeStart}–{rangeEnd}</span> of{" "}
                  <span className="text-[#273951] font-medium">{filteredSorted.length}</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-[4px] border border-[#e5edf5] bg-white text-[#64748d] hover:text-[#061b31] hover:border-[#cbd5e1] disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <span className="text-[12px] text-[#64748d] tabular-nums px-2 min-w-[64px] text-center">
                    Page <span className="text-[#273951] font-medium">{page}</span> of{" "}
                    <span className="text-[#273951] font-medium">{totalPages}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-[4px] border border-[#e5edf5] bg-white text-[#64748d] hover:text-[#061b31] hover:border-[#cbd5e1] disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action dialogs */}
      <EditAppointmentDialog
        appointmentId={editId}
        isAdmin={isAdmin}
        onClose={() => setEditId(null)}
        onUpdated={() => {
          setEditId(null);
          load(range);
        }}
      />
      <CancelAppointmentDialog
        appointmentId={cancelTarget?.id ?? null}
        patientName={cancelTarget ? `${cancelTarget.patient.firstName} ${cancelTarget.patient.lastName}` : ""}
        appointmentDateTime={cancelTarget?.dateTime ?? null}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => {
          setCancelTarget(null);
          load(range);
        }}
      />
      <DeleteAppointmentDialog
        appointmentId={deleteTarget?.id ?? null}
        patientName={deleteTarget ? `${deleteTarget.patient.firstName} ${deleteTarget.patient.lastName}` : ""}
        appointmentDateTime={deleteTarget?.dateTime ?? null}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          load(range);
        }}
      />
    </div>
  );
}
