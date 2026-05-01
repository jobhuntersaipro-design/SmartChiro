"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Calendar, Loader2, ArrowRight, Phone } from "lucide-react";
import { formatRelativeAppointmentTime, appointmentTimeBucket, buildWhatsAppUrl } from "@/lib/format";
import { getDoctorColor } from "@/lib/doctor-color";

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
  const config: Record<string, { bg: string; text: string; label: string }> = {
    SCHEDULED: { bg: "bg-[#EFF6FF]", text: "text-[#1E40AF]", label: "Scheduled" },
    CHECKED_IN: { bg: "bg-[#F0FDF4]", text: "text-[#15803D]", label: "Checked-in" },
    IN_PROGRESS: { bg: "bg-[#FEFCE8]", text: "text-[#854D0E]", label: "In progress" },
    COMPLETED: { bg: "bg-[#F0F0F0]", text: "text-[#64748d]", label: "Completed" },
    CANCELLED: { bg: "bg-[#FEF2F2]", text: "text-[#991B1B]", label: "Cancelled" },
    NO_SHOW: { bg: "bg-[#FEF2F2]", text: "text-[#991B1B]", label: "No-show" },
  };
  const c = config[status] ?? config.SCHEDULED;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function DoctorBadge({ id, name }: { id: string; name: string }) {
  const c = getDoctorColor(id);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {name}
    </span>
  );
}

function TimeCell({ iso }: { iso: string }) {
  const bucket = appointmentTimeBucket(iso);
  const text = formatRelativeAppointmentTime(iso);
  let style: React.CSSProperties = {};
  let cls = "text-[14px]";
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
    <time dateTime={iso} className={cls} style={style}>
      {text}
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
          <div className="grid grid-cols-[180px_1fr_140px_120px_100px] gap-3 px-4 py-2 border-b border-[#e5edf5] bg-[#f6f9fc]">
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
                className="grid grid-cols-[180px_1fr_140px_120px_100px] gap-3 items-center px-4 py-2.5 border-b border-[#e5edf5] last:border-b-0 hover:bg-[#fbfcfe] transition-colors"
              >
                <TimeCell iso={a.dateTime} />
                <Link
                  href={`/dashboard/patients/${a.patient.id}/details`}
                  className="text-[14px] font-medium text-[#061b31] hover:text-[#533afd] transition-colors truncate"
                >
                  {a.patient.firstName} {a.patient.lastName}
                </Link>
                <DoctorBadge id={a.doctor.id} name={a.doctor.name} />
                <StatusPill status={a.status} />
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[13px] text-[#64748d] hover:text-[#25D366] transition-colors w-fit"
                  >
                    <Phone className="h-3 w-3" strokeWidth={1.75} />
                    WhatsApp
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
