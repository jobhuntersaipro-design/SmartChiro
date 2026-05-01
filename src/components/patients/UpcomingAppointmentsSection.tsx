"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Calendar, Loader2, ArrowRight } from "lucide-react";
import { formatAppointmentDateTime, buildWhatsAppUrl } from "@/lib/format";

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
}

const SHADOW_CARD =
  "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)";

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  week: "This Week",
  month: "Next 30 Days",
};

function StatusPill({ status }: { status: string }) {
  // Dot + colored text only, no pill background — eliminates wasted space
  // while preserving color coding by status.
  const config: Record<string, { text: string; dot: string; label: string }> = {
    SCHEDULED:    { text: "#1d4ed8", dot: "#3b82f6", label: "Scheduled"  },
    CHECKED_IN:   { text: "#15803d", dot: "#22c55e", label: "Checked-in" },
    IN_PROGRESS:  { text: "#854d0e", dot: "#eab308", label: "In progress"},
    COMPLETED:    { text: "#64748d", dot: "#94a3b8", label: "Completed"  },
    CANCELLED:    { text: "#b91c1c", dot: "#ef4444", label: "Cancelled"  },
    NO_SHOW:      { text: "#b91c1c", dot: "#ef4444", label: "No-show"    },
  };
  const c = config[status] ?? config.SCHEDULED;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: c.text }}>
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function TimeCell({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="text-[14px] text-[#273951] tabular-nums">
      {formatAppointmentDateTime(iso)}
    </time>
  );
}

function EmptyState({ range }: { range: Range }) {
  return (
    <div className="px-6 py-10 text-center">
      <Calendar className="h-8 w-8 text-[#94a3b8] mx-auto mb-2" strokeWidth={1.25} />
      <p className="text-[14px] text-[#64748d]">
        No appointments {range === "today" ? "today" : range === "week" ? "this week" : "in the next 30 days"}.
      </p>
    </div>
  );
}

const MAX_ROWS = 10;

export function UpcomingAppointmentsSection() {
  const [range, setRange] = useState<Range>("week");
  const [appointments, setAppointments] = useState<UpcomingAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

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
    load(range);
  }, [range, load]);

  const visible = appointments.slice(0, MAX_ROWS);
  const overflow = total - visible.length;

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden mb-5"
      style={{ boxShadow: SHADOW_CARD }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5edf5] bg-[#fbfcfe]">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#533afd]" strokeWidth={1.75} />
          <h2 className="text-[15px] font-medium text-[#061b31]">Upcoming Appointments</h2>
          {!loading && total > 0 && (
            <span className="text-[12px] text-[#64748d]">· {total} total</span>
          )}
        </div>

        {/* Range tabs */}
        <div className="flex items-center rounded-[4px] border border-[#e5edf5] bg-white overflow-hidden">
          {(["today", "week", "month"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 h-7 text-[13px] font-medium transition-colors ${
                range === r
                  ? "bg-[#533afd] text-white"
                  : "text-[#64748d] hover:text-[#061b31] hover:bg-[#f6f9fc]"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#64748d]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={2} />
          <span className="text-[13px]">Loading…</span>
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState range={range} />
      ) : (
        <>
          <div className="grid grid-cols-[180px_1fr_140px_120px_140px] gap-3 px-4 py-2 border-b border-[#e5edf5] bg-[#f6f9fc]">
            <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">When</span>
            <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Patient</span>
            <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Doctor</span>
            <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Status</span>
            <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Contact</span>
          </div>
          {visible.map((a) => {
            const wa = buildWhatsAppUrl(a.patient.phone);
            return (
              <div
                key={a.id}
                className="grid grid-cols-[180px_1fr_140px_120px_140px] gap-3 items-center px-4 py-2.5 border-b border-[#e5edf5] last:border-b-0 hover:bg-[#fbfcfe] transition-colors"
              >
                <TimeCell iso={a.dateTime} />
                <Link
                  href={`/dashboard/patients/${a.patient.id}/details`}
                  className="text-[14px] font-medium text-[#061b31] hover:text-[#533afd] transition-colors truncate"
                >
                  {a.patient.firstName} {a.patient.lastName}
                </Link>
                <span className="text-[14px] text-[#273951] truncate">{a.doctor.name}</span>
                <StatusPill status={a.status} />
                {wa && a.patient.phone ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[13px] text-[#273951] hover:text-[#25D366] hover:underline underline-offset-2 transition-colors truncate"
                    title="Open WhatsApp chat"
                  >
                    {a.patient.phone}
                  </a>
                ) : (
                  <span className="text-[13px] text-[#94a3b8]">—</span>
                )}
              </div>
            );
          })}
          {overflow > 0 && (
            <div className="px-4 py-2.5 border-t border-[#e5edf5] bg-[#fbfcfe] text-center">
              <span className="text-[13px] text-[#64748d] inline-flex items-center gap-1">
                + {overflow} more upcoming appointment{overflow === 1 ? "" : "s"}
                <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
