"use client";

import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";

interface Entry {
  id: string;
  action:
    | "CREATE"
    | "UPDATE"
    | "DELETE"
    | "CANCEL"
    | "RESCHEDULE"
    | "DOCTOR_REASSIGN"
    | "STATUS_CHANGE"
    | "NOTE_EDIT";
  actorId: string | null;
  actorEmail: string;
  actorName: string | null;
  patientNameAtEvent: string;
  dateTimeAtEvent: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  createdAt: string;
}

interface Props {
  appointmentId: string;
}

const ACTION_STYLE: Record<
  Entry["action"],
  { bg: string; text: string; label: string }
> = {
  CREATE:          { bg: "#ECFDF5", text: "#108c3d", label: "Created" },
  UPDATE:          { bg: "#EFF6FF", text: "#1E40AF", label: "Updated" },
  RESCHEDULE:      { bg: "#FEF3C7", text: "#92400E", label: "Rescheduled" },
  STATUS_CHANGE:   { bg: "#F0EEFF", text: "#635BFF", label: "Status changed" },
  DOCTOR_REASSIGN: { bg: "#F0EEFF", text: "#635BFF", label: "Reassigned" },
  CANCEL:          { bg: "#FEF2F2", text: "#DF1B41", label: "Cancelled" },
  NOTE_EDIT:       { bg: "#F1F5F9", text: "#64748b", label: "Note edited" },
  DELETE:          { bg: "#FEF2F2", text: "#DF1B41", label: "Deleted" },
};

const FIELD_LABELS: Record<string, string> = {
  dateTime: "Date & time",
  duration: "Duration",
  status: "Status",
  notes: "Notes",
  doctorId: "Doctor",
  treatmentType: "Treatment",
};

function formatValue(field: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "dateTime" && typeof value === "string") {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function actorInitials(name: string | null, email: string): string {
  const src = name ?? email.split("@")[0];
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function AppointmentAuditLog({ appointmentId }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/appointments/${appointmentId}/audit-log?limit=20`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setEntries(j.entries);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  if (loading) {
    return (
      <div className="py-3 flex items-center gap-2 text-[12px] text-[#697386]">
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
        Loading history…
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <p className="text-[12px] text-[#697386] py-2">
        No history yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((e) => {
        const style = ACTION_STYLE[e.action];
        const changeKeys = Object.keys(e.changes ?? {});
        return (
          <li key={e.id} className="flex gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0EEFF] text-[10px] font-semibold text-[#635BFF]">
              {actorInitials(e.actorName, e.actorEmail)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  <History className="h-2.5 w-2.5 mr-0.5" strokeWidth={2} />
                  {style.label}
                </span>
                <span className="text-[12px] text-[#425466]">
                  by {e.actorName ?? e.actorEmail}
                </span>
                <span
                  className="text-[11px] text-[#697386] tabular-nums"
                  title={new Date(e.createdAt).toLocaleString()}
                >
                  · {relativeTime(e.createdAt)}
                </span>
              </div>
              {changeKeys.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {changeKeys.map((k) => {
                    const c = e.changes[k];
                    return (
                      <li
                        key={k}
                        className="text-[11px] text-[#425466] flex flex-wrap gap-1"
                      >
                        <span className="font-medium text-[#697386]">
                          {FIELD_LABELS[k] ?? k}:
                        </span>
                        <span className="line-through opacity-60 tabular-nums">
                          {formatValue(k, c.from)}
                        </span>
                        <span className="text-[#697386]">→</span>
                        <span className="text-[#061b31] tabular-nums">
                          {formatValue(k, c.to)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
