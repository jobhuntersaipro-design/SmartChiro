"use client";

import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { formatAppointmentDateTime } from "@/lib/format";
import type { OutreachLogItem, OutreachStatusName } from "@/types/outreach";

const STATUS_PILL: Record<OutreachStatusName, { label: string; className: string }> = {
  SENT: { label: "Sent", className: "bg-success-subtle text-success" },
  PENDING: { label: "Queued", className: "bg-warning-subtle text-warning" },
  FAILED: { label: "Failed", className: "bg-danger-subtle text-danger" },
  SKIPPED: { label: "Skipped", className: "bg-surface-hover text-fg-muted" },
};

interface OutreachLogListProps {
  items: OutreachLogItem[];
  /** Show the patient column (branch log). */
  showPatient?: boolean;
  emptyText: string;
}

/** Recall / review requests with status, channel and reason. */
export function OutreachLogList({ items, showPatient, emptyText }: OutreachLogListProps) {
  if (items.length === 0) return <p className="text-[14px] text-fg-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const pill = STATUS_PILL[item.status];
        const Icon = item.channel === "EMAIL" ? Mail : MessageCircle;
        const when = item.sentAt ?? (item.status === "PENDING" ? item.scheduledFor : item.createdAt);
        return (
          <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 text-[14px]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{item.type === "RECALL" ? "Recall" : "Review request"}</span>
                {showPatient && item.patient && (
                  <Link
                    href={`/dashboard/patients/${item.patient.id}/details`}
                    className="truncate text-fg-secondary hover:text-brand hover:underline"
                  >
                    {item.patient.name}
                  </Link>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${pill.className}`}>{pill.label}</span>
                <span className="inline-flex items-center gap-1 text-[13px] text-fg-muted">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {item.channel === "EMAIL" ? "Email" : "WhatsApp"}
                </span>
              </div>
              {item.failureReason && (
                <p className="mt-0.5 text-[13px] text-fg-muted break-words">{item.failureReason}</p>
              )}
            </div>
            <div className="shrink-0 text-right text-[13px] text-fg-muted tabular-nums whitespace-nowrap">
              <div>{formatAppointmentDateTime(when)}</div>
              <div>{item.createdByName ? `by ${item.createdByName}` : "Automatic"}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
