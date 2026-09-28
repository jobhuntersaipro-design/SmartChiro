"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import type { OutreachLogItem } from "@/types/outreach";

interface SendRecallButtonProps {
  patientId: string;
  patientName: string;
  /** `link` is the compact dashboard variant. */
  variant?: "button" | "link";
  disabled?: boolean;
  disabledReason?: string;
  onSent?: (item: OutreachLogItem) => void;
}

interface ErrorBody {
  error?: string;
  message?: string;
  canForce?: boolean;
}

function channelLabel(item: OutreachLogItem): string {
  return item.channel === "EMAIL" ? "email" : "WhatsApp";
}

/** Sends a recall now; offers OWNER / ADMIN to resend inside the cooldown. */
export function SendRecallButton({
  patientId,
  patientName,
  variant = "button",
  disabled,
  disabledReason,
  onSent,
}: SendRecallButtonProps) {
  const [busy, setBusy] = useState(false);

  async function post(force: boolean): Promise<void> {
    const res = await fetch(`/api/patients/${patientId}/outreach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "RECALL", force }),
    });
    const body = (await res.json().catch(() => ({}))) as ErrorBody & { outreach?: OutreachLogItem };
    if (res.ok && body.outreach) {
      const item = body.outreach;
      if (item.status === "SENT") toast.success(`Recall sent to ${patientName} by ${channelLabel(item)}`);
      else if (item.status === "PENDING") toast.success(`Recall to ${patientName} queued — it will retry shortly`);
      else toast.error(`Recall not sent: ${item.failureReason ?? item.status.toLowerCase()}`);
      onSent?.(item);
      return;
    }
    if (res.status === 409 && body.error === "cooldown" && body.canForce && !force) {
      if (window.confirm(`${body.message ?? "Recalled recently"}. Send another recall to ${patientName} anyway?`)) {
        await post(true);
      }
      return;
    }
    toast.error(body.message ?? "Couldn't send the recall");
  }

  async function onClick() {
    setBusy(true);
    try {
      await post(false);
    } catch {
      toast.error("Couldn't send the recall");
    } finally {
      setBusy(false);
    }
  }

  const title = disabled ? disabledReason : `Send a recall message to ${patientName}`;
  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        title={title}
        aria-label={`Send recall to ${patientName}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1 text-[12px] font-medium text-[#533afd] hover:bg-[#F0EEFF] disabled:cursor-not-allowed disabled:text-[#A3ACB9] disabled:hover:bg-transparent"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} /> : <Send className="h-3 w-3" strokeWidth={2} />}
        Recall
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#E3E8EE] bg-white px-3 py-1.5 text-[14px] text-[#0A2540] hover:bg-[#F0F3F7] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Send className="h-4 w-4" strokeWidth={1.5} />}
      Send recall
    </button>
  );
}
