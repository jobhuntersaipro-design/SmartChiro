"use client";

import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { formatAppointmentDateTime } from "@/lib/format";
import type { OutreachLogItem, OutreachStatusName } from "@/types/outreach";

const STATUS_PILL: Record<OutreachStatusName, { label: string; className: string }> = {
  SENT: { label: "Sent", className: "bg-[#E5F8E5] text-[#1F7A1F]" },
  PENDING: { label: "Queued", className: "bg-[#FEF4E4] text-[#9A5B00]" },
  FAILED: { label: "Failed", className: "bg-[#FDE7EC] text-[#DF1B41]" },
  SKIPPED: { label: "Skipped", className: "bg-[#F0F3F7] text-[#697386]" },
};

interface OutreachLogListProps {
  items: OutreachLogItem[];
  /** Show the patient column (branch log). */
  showPatient?: boolean;
  emptyText: string;
}

/** Recall / review requests with status, channel and reason. */
export function OutreachLogList({ items, showPatient, emptyText }: OutreachLogListProps) {
  if (items.length === 0) return <p className="text-[14px] text-[#697386]">{emptyText}</p>;
  return (
    <ul className="divide-y divide-[#E3E8EE]">
      {items.map((item) => {
        const pill = STATUS_PILL[item.status];
        const Icon = item.channel === "EMAIL" ? Mail : MessageCircle;
        const when = item.sentAt ?? (item.status === "PENDING" ? item.scheduledFor : item.createdAt);
        return (
          <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 text-[14px]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[#0A2540]">{item.type === "RECALL" ? "Recall" : "Review request"}</span>
                {showPatient && item.patient && (
                  <Link
                    href={`/dashboard/patients/${item.patient.id}/details`}
                    className="truncate text-[#425466] hover:text-[#635BFF] hover:underline"
                  >
                    {item.patient.name}
                  </Link>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${pill.className}`}>{pill.label}</span>
                <span className="inline-flex items-center gap-1 text-[13px] text-[#697386]">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {item.channel === "EMAIL" ? "Email" : "WhatsApp"}
                </span>
              </div>
              {item.failureReason && (
                <p className="mt-0.5 text-[13px] text-[#697386] break-words">{item.failureReason}</p>
              )}
            </div>
            <div className="shrink-0 text-right text-[13px] text-[#697386] tabular-nums whitespace-nowrap">
              <div>{formatAppointmentDateTime(when)}</div>
              <div>{item.createdByName ? `by ${item.createdByName}` : "Automatic"}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
