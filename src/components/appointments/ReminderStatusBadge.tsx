"use client";

import { useEffect, useState } from "react";

type Reminder = {
  id: string;
  channel: "WHATSAPP" | "EMAIL";
  offsetMin: number;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  sentAt: string | null;
  failureReason: string | null;
};

type Summary = "none" | "pending" | "sent" | "failed";

type Props = { appointmentId: string };

export function ReminderStatusBadge({ appointmentId }: Props) {
  const [rows, setRows] = useState<Reminder[] | null>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary>("none");

  useEffect(() => {
    fetch(`/api/appointments/${appointmentId}/reminders`)
      .then((r) => r.json())
      .then((j: { reminders: Reminder[] }) => {
        setRows(j.reminders);
        if (j.reminders.length === 0) return setSummary("none");
        if (j.reminders.some((r) => r.status === "FAILED")) return setSummary("failed");
        if (j.reminders.some((r) => r.status === "PENDING")) return setSummary("pending");
        if (j.reminders.every((r) => r.status === "SENT" || r.status === "SKIPPED")) {
          return setSummary("sent");
        }
        setSummary("pending");
      });
  }, [appointmentId]);

  if (summary === "none") return null;

  const palette: Record<Summary, { bg: string; text: string; label: string }> = {
    none: { bg: "", text: "", label: "" },
    pending: { bg: "#F0EEFF", text: "#635BFF", label: "Pending" },
    sent: { bg: "#E5F8E5", text: "#30B130", label: "Reminded" },
    failed: { bg: "#FDE7EC", text: "#DF1B41", label: "Failed" },
  };
  const p = palette[summary];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full px-2 py-0.5 text-[12px] font-medium"
        style={{ background: p.bg, color: p.text }}
      >
        {p.label}
      </button>
      {open && rows && (
        <div className="absolute right-0 z-20 mt-1 w-[320px] rounded-[6px] border border-[#E3E8EE] bg-white p-3 shadow-md">
          <div className="mb-2 text-[12px] uppercase tracking-wide text-[#697386]">
            Reminders
          </div>
          <ul className="space-y-1.5 text-[13px]">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span className="text-[#425466]">
                  {r.channel} · {r.offsetMin}m before
                </span>
                <span className="text-[#0A2540]">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
