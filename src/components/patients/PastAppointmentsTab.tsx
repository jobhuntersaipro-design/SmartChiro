"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, X, ChevronDown, Calendar } from "lucide-react";
import type { BranchRole } from "@prisma/client";
import type {
  PastAppointment,
  PastAppointmentStats,
  PastAppointmentsResponse,
} from "@/types/patient";
import { PastAppointmentStatCards } from "@/components/patients/PastAppointmentStatCards";
import {
  PastAppointmentTable,
  type PastSortKey,
  type PastSortDir,
} from "@/components/patients/PastAppointmentTable";
import { EditPastAppointmentDialog } from "@/components/patients/EditPastAppointmentDialog";
import { IssueInvoiceDialog } from "@/components/patients/IssueInvoiceDialog";

interface PastAppointmentsTabProps {
  patientId: string;
  branchRole: BranchRole | null;
}

type StatusFilter = "COMPLETED" | "CANCELLED" | "NO_SHOW" | "STALE";
type RangePreset = "last30d" | "last3m" | "last12m" | "all";

const PAGE_SIZE = 10;
const VALID_STATUSES: StatusFilter[] = [
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "STALE",
];
const VALID_RANGES: RangePreset[] = ["last30d", "last3m", "last12m", "all"];

const STATUS_LABEL: Record<StatusFilter, string> = {
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  STALE: "Stale",
};
const RANGE_LABEL: Record<RangePreset, string> = {
  last30d: "Last 30 days",
  last3m: "Last 3 months",
  last12m: "Last 12 months",
  all: "All time",
};

// Convert a preset to a from/to ISO range. The API enforces the past-appointment
// floor (`dateTime < now`) regardless of `to`, so passing now() is safe.
function rangeToFromTo(preset: RangePreset): {
  from?: string;
  to?: string;
} {
  if (preset === "all") return {};
  const now = new Date();
  const days = preset === "last30d" ? 30 : preset === "last3m" ? 90 : 365;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

function parseStatusList(raw: string | null): StatusFilter[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is StatusFilter =>
      VALID_STATUSES.includes(s as StatusFilter),
    );
}

export function PastAppointmentsTab({
  patientId,
  branchRole,
}: PastAppointmentsTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initial state hydrated from URL so deep-links work + back button restores.
  const [statuses, setStatuses] = useState<StatusFilter[]>(() =>
    parseStatusList(searchParams.get("status")),
  );
  const [doctorId, setDoctorId] = useState<string | null>(
    searchParams.get("doctorId"),
  );
  const [range, setRange] = useState<RangePreset>(() => {
    const r = searchParams.get("range");
    return VALID_RANGES.includes(r as RangePreset)
      ? (r as RangePreset)
      : "last12m";
  });
  const [sortKey, setSortKey] = useState<PastSortKey>("when");
  const [sortDir, setSortDir] = useState<PastSortDir>("desc");
  const [page, setPage] = useState<number>(() => {
    const p = parseInt(searchParams.get("page") ?? "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  });

  const [data, setData] = useState<PastAppointmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<PastAppointment | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceTarget, setInvoiceTarget] = useState<PastAppointment | null>(
    null,
  );
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // ─── URL sync (filters/page → ?param=value) ───
  // We always run replace so back-button doesn't fill with intermediate states.
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "history");
    params.set("sub", "appointments");
    if (statuses.length > 0) params.set("status", statuses.join(","));
    else params.delete("status");
    if (doctorId) params.set("doctorId", doctorId);
    else params.delete("doctorId");
    if (range !== "last12m") params.set("range", range);
    else params.delete("range");
    if (page !== 1) params.set("page", String(page));
    else params.delete("page");
    router.replace(
      `/dashboard/patients/${patientId}/details?${params.toString()}`,
      { scroll: false },
    );
    // searchParams intentionally excluded — we only push when local state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, doctorId, range, page, patientId, router]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);

  // ─── Data fetch ───
  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statuses.length > 0) params.set("status", statuses.join(","));
      if (doctorId) params.set("doctorId", doctorId);
      const { from, to } = rangeToFromTo(range);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const res = await fetch(
        `/api/patients/${patientId}/past-appointments?${params.toString()}`,
      );
      if (!res.ok) {
        setError("Failed to load past appointments.");
        return;
      }
      const json = (await res.json()) as PastAppointmentsResponse;
      setData(json);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [patientId, statuses, doctorId, range, sortKey, sortDir, page]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // Reset to page 1 whenever the user changes the filter/sort slice.
  // (Same pattern as UpcomingAppointmentsSection.) page is deliberately
  // omitted from the deps — including it would cause an infinite reset loop.
  useEffect(() => {
    setPage(1);
  }, [statuses, doctorId, range, sortKey, sortDir]);

  // Doctor options derived from currently-loaded rows so the dropdown
  // never offers a doctor with zero results for this patient.
  const doctorOptions = useMemo(() => {
    if (!data) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    data.appointments.forEach((a) => map.set(a.doctor.id, a.doctor.name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [data]);

  const onSort = useCallback(
    (k: PastSortKey) => {
      // Avoid nesting setSortDir inside setSortKey's functional updater —
      // React StrictMode invokes updaters twice in dev, which would flip
      // direction back to its original value (spec from UpcomingAppointmentsSection).
      if (sortKey === k) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(k);
        setSortDir(k === "when" ? "desc" : "asc");
      }
    },
    [sortKey],
  );

  function toggleStatus(s: StatusFilter) {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function clearFilters() {
    setStatuses([]);
    setDoctorId(null);
    setRange("last12m");
  }

  function showOnlyStale() {
    setStatuses(["STALE"]);
    setDoctorId(null);
  }

  const stats: PastAppointmentStats =
    data?.stats ?? {
      completed: 0,
      cancelled: 0,
      noShow: 0,
      stale: 0,
      paid: 0,
      outstanding: 0,
      currency: "MYR",
    };

  const rows: PastAppointment[] = data?.appointments ?? [];
  const totalRowsAfterFilter = data?.total ?? 0;
  const totalAcrossPatient =
    stats.completed + stats.cancelled + stats.noShow + stats.stale;

  const hasActiveFilter =
    statuses.length > 0 || doctorId !== null || range !== "last12m";

  // ─── Action handlers ───
  function handleEdit(row: PastAppointment) {
    setEditTarget(row);
    setEditOpen(true);
  }

  async function handleCreateVisit(row: PastAppointment) {
    try {
      const res = await fetch(`/api/appointments/${row.id}/visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        // Surface a minimal alert in v1 — repo has no toast lib yet.
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        alert(humanizeError(data?.error ?? "unknown"));
        return;
      }
      await fetchPage();
    } catch {
      alert("Network error. Please try again.");
    }
  }

  function handleIssueInvoice(row: PastAppointment) {
    setInvoiceTarget(row);
    setInvoiceOpen(true);
  }

  async function handleRegenerateInvoice(invoiceId: string) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/regenerate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        alert(humanizeError(data?.error ?? "unknown"));
        return;
      }
      await fetchPage();
    } catch {
      alert("Network error. Please try again.");
    }
  }

  // ─── Render ───
  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <PastAppointmentStatCards stats={stats} onShowStale={showOnlyStale} />

      {/* Filter bar */}
      <div className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#94a3b8] mr-1">
            Filter
          </span>
          {/* Status chips */}
          <div className="flex flex-wrap items-center gap-1">
            {VALID_STATUSES.map((s) => {
              const active = statuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`px-2.5 h-7 rounded-[4px] text-[12px] font-medium border cursor-pointer transition-colors duration-200 ${
                    active
                      ? "bg-[#f5f3ff] border-[#533afd] text-[#533afd]"
                      : "bg-white border-[#e5edf5] text-[#64748d] hover:border-[#cbd5e1] hover:text-[#061b31]"
                  }`}
                  aria-pressed={active}
                >
                  {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>

          {/* Doctor filter — only shown if loaded data has >1 doctor */}
          {doctorOptions.length > 1 && (
            <div className="relative ml-1">
              <select
                value={doctorId ?? ""}
                onChange={(e) => setDoctorId(e.target.value || null)}
                className="appearance-none cursor-pointer text-[13px] text-[#273951] bg-white border border-[#e5edf5] rounded-[4px] h-7 pl-2.5 pr-7 hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#533afd] focus:border-[#533afd] transition-colors duration-200"
                aria-label="Doctor"
              >
                <option value="">All doctors</option>
                {doctorOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none"
                strokeWidth={2}
              />
            </div>
          )}

          {/* Date range */}
          <div className="relative ml-1">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangePreset)}
              className="appearance-none cursor-pointer text-[13px] text-[#273951] bg-white border border-[#e5edf5] rounded-[4px] h-7 pl-2.5 pr-7 hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#533afd] focus:border-[#533afd] transition-colors duration-200"
              aria-label="Date range"
            >
              {VALID_RANGES.map((r) => (
                <option key={r} value={r}>
                  {RANGE_LABEL[r]}
                </option>
              ))}
            </select>
            <ChevronDown
              className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none"
              strokeWidth={2}
            />
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[12px] text-[#64748d] hover:text-[#061b31] cursor-pointer transition-colors duration-200 ml-1"
            >
              <X className="h-3 w-3" strokeWidth={2} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-[#64748d]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={2} />
          <span className="text-[13px]">Loading past appointments…</span>
        </div>
      ) : error ? (
        <div className="rounded-[6px] border border-[#fcd0db] bg-[#fef2f5] px-4 py-3 text-[13px] text-[#ea2261] flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchPage}
            className="text-[#ea2261] underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : totalAcrossPatient === 0 ? (
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-6 py-12 text-center">
          <Calendar
            className="h-7 w-7 text-[#cbd5e1] mx-auto mb-2"
            strokeWidth={1.5}
          />
          <p className="text-[14px] text-[#64748d]">
            No past appointments yet. Once visits are completed, they&apos;ll
            appear here.
          </p>
        </div>
      ) : (
        <PastAppointmentTable
          rows={rows}
          total={totalRowsAfterFilter}
          page={page}
          pageSize={PAGE_SIZE}
          patientId={patientId}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          onPageChange={setPage}
          branchRole={branchRole}
          loading={loading}
          onEdit={handleEdit}
          onCreateVisit={handleCreateVisit}
          onIssueInvoice={handleIssueInvoice}
          onRegenerateInvoice={handleRegenerateInvoice}
        />
      )}

      {/* Dialogs */}
      <EditPastAppointmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        appointment={editTarget}
        onSaved={fetchPage}
      />
      <IssueInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        appointment={
          invoiceTarget
            ? {
                id: invoiceTarget.id,
                dateTime: invoiceTarget.dateTime,
                suggestedAmount: null,
              }
            : null
        }
        onIssued={fetchPage}
      />
    </div>
  );
}

function humanizeError(code: string): string {
  switch (code) {
    case "appointment_not_completed":
      return "Only COMPLETED appointments can be invoiced or have visits created.";
    case "invoice_already_paid":
      return "Invoice is already paid — issue a new one instead.";
    case "forbidden":
      return "You don't have permission for this action.";
    case "not_found":
      return "Record not found.";
    case "unauthorized":
      return "Session expired. Please sign in again.";
    default:
      return "Action failed. Please try again.";
  }
}
